# Generated by Django 3.2.14 on 2022-09-21 19:13

from copy import deepcopy
from collections import defaultdict
from django.db import migrations, models
import django.db.models.deletion
import json
from pyliftover.liftover import LiftOver
from tqdm import tqdm

from seqr.utils.xpos_utils import get_chrom_pos

liftover_to_38 = LiftOver('hg19', 'hg38')


def _get_model_id(chrom, pos, end, ref, alt):
    return f'{chrom}-{pos}-{f"{ref}-{alt}" if ref else end}'


def _is_match(model, variant_json):
    chrom, pos = get_chrom_pos(model.xpos)
    _, end = get_chrom_pos(model.xpos_end) if model.xpos_end else (None, None)
    model_id = _get_model_id(chrom, pos, end, model.ref, model.alt)
    json_id = _get_model_id(
        variant_json['referenceName'], variant_json['start'], variant_json.get('end'),
        variant_json.get('referenceBases'), variant_json.get('alternateBases'))
    return model_id == json_id


def _get_linked_variant(submission, variant, family_variants):
    # Fix malformed submissions
    if variant['referenceName'] == 'GRCh37':
        variant['referenceName'] = variant['assembly']
        variant['assembly'] = 'GRCh37'

    variant_models = [sv for sv in family_variants if _is_match(sv, variant)]

    if not variant_models and \
            submission.individual.family.project.genome_version == '38' and variant['assembly'] == 'GRCh37':
        lifted_variant = deepcopy(variant)
        lifted = liftover_to_38.convert_coordinate(f'chr{variant["referenceName"]}', int(variant['start']))
        lifted_variant['start'] = lifted[0][1]
        variant_models = [sv for sv in family_variants if _is_match(sv, lifted_variant)]

    if not variant_models:
        if submission.deleted_date:
            return None
        raise Exception(
            f'No matches found for {submission.guid} (family {submission.individual.family.family_id}) - {json.dumps(f["variant"])}'
        )

    if len(variant_models) > 1:
        tagged_models = [sv for sv in variant_models if sv.varianttag_set.filter(variant_tag_type__name='seqr MME')]
        if len(tagged_models) == 1:
            return tagged_models[0]

        # For gCNV we have variants tagged in both the original loading and a newer loading that have different IDs
        # but represent the same variant. It doesn't matter which of those is tagged if they are really the same
        sv_types = {sv.saved_variant_json.get('svType') for sv in variant_models}
        if len(sv_types) == 1 and sv_types.pop():
            return sorted(variant_models, key=lambda sv: sv.varianttag_set.count(), reverse=True)[0]

        raise Exception(
            f'{len(variant_models)} matches found for {submission.guid} (family {submission.individual.family.family_id})'
            f' - {json.dumps(variant)}: {", ".join([sv.guid for sv in variant_models])}'
        )

    return variant_models[0]


def update_mme_variant_links(apps, schema_editor):
    SavedVariant = apps.get_model('seqr', 'SavedVariant')
    MatchmakerSubmission = apps.get_model('matchmaker', 'MatchmakerSubmission')
    MatchmakerSubmissionGenes = apps.get_model('matchmaker', 'MatchmakerSubmissionGenes')
    db_alias = schema_editor.connection.alias

    gene_submissions = MatchmakerSubmission.objects.using(db_alias).filter(
        genomic_features__isnull=False).prefetch_related('individual', 'individual__family__project')
    if not gene_submissions:
        return
    print(f'Migrating variants for {len(gene_submissions)} submissions')

    submissions_by_family = defaultdict(list)
    for s in gene_submissions:
        submissions_by_family[s.individual.family_id].append(s)

    variants_by_family = defaultdict(list)
    saved_variants = SavedVariant.objects.using(db_alias).filter(
        family_id__in=submissions_by_family.keys()).prefetch_related('varianttag_set')
    for sv in saved_variants:
        variants_by_family[sv.family_id].append(sv)

    models = []
    print('Mapping variants')
    for family_id, submissions in tqdm(submissions_by_family.items()):
        for submission in submissions:
            for f in submission.genomic_features:
                saved_variant = _get_linked_variant(submission, f['variant'], variants_by_family[family_id])
                if saved_variant:
                    models.append(MatchmakerSubmissionGenes(
                        matchmaker_submission=submission,
                        saved_variant=saved_variant,
                        gene_id=f['gene']['id'],
                    ))

    print('Creating models')
    MatchmakerSubmissionGenes.objects.using(db_alias).bulk_create(models)
    print('Done')


class Migration(migrations.Migration):

    dependencies = [
        ('seqr', '0047_auto_20220908_1851'),
        ('matchmaker', '0004_alter_matchmakersubmission_individual'),
    ]

    operations = [
        migrations.CreateModel(
            name='MatchmakerSubmissionGenes',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('gene_id', models.CharField(max_length=20)),
                ('matchmaker_submission', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='matchmaker.matchmakersubmission')),
                ('saved_variant', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='seqr.savedvariant')),
            ],
        ),
        migrations.RunPython(update_mme_variant_links, reverse_code=migrations.RunPython.noop),
        # TODO write reverse migration and re-enable this
        # migrations.RemoveField(
        #     model_name='matchmakersubmission',
        #     name='genomic_features',
        # ),
    ]
