import logging
from collections import OrderedDict
from django.core.management.base import BaseCommand

from reference_data.management.commands.utils.gencode_utils import LATEST_GENCODE_RELEASE, OLD_GENCODE_RELEASES
from reference_data.management.commands.utils.update_utils import update_records
from reference_data.management.commands.update_human_phenotype_ontology import update_hpo
from reference_data.management.commands.update_dbnsfp_gene import DbNSFPReferenceDataHandler
from reference_data.management.commands.update_gencode import update_gencode
from reference_data.management.commands.update_gene_constraint import GeneConstraintReferenceDataHandler
from reference_data.management.commands.update_omim import OmimReferenceDataHandler, CachedOmimReferenceDataHandler
from reference_data.management.commands.update_primate_ai import PrimateAIReferenceDataHandler
from reference_data.management.commands.update_mgi import MGIReferenceDataHandler
from reference_data.management.commands.update_gene_cn_sensitivity import CNSensitivityReferenceDataHandler
from reference_data.management.commands.update_gencc import GenCCReferenceDataHandler
from reference_data.management.commands.update_clingen import ClinGenReferenceDataHandler
from reference_data.management.commands.update_refseq import RefseqReferenceDataHandler


logger = logging.getLogger(__name__)

REFERENCE_DATA_SOURCES = OrderedDict([
    ("gencode", None),
    ("omim", CachedOmimReferenceDataHandler),
    ("dbnsfp_gene", DbNSFPReferenceDataHandler),
    ("gene_constraint", GeneConstraintReferenceDataHandler),
    ("gene_cn_sensitivity", CNSensitivityReferenceDataHandler),
    ("primate_ai", PrimateAIReferenceDataHandler),
    ("mgi", MGIReferenceDataHandler),
    ("gencc", GenCCReferenceDataHandler),
    ("clingen", ClinGenReferenceDataHandler),
    ("refseq", RefseqReferenceDataHandler),
    ("hpo", None),
])


class Command(BaseCommand):
    help = "Loads all reference data"

    def add_arguments(self, parser):
        omim_options = parser.add_mutually_exclusive_group(required=True)
        omim_options.add_argument('--omim-key', help="OMIM key provided with registration at http://data.omim.org/downloads")
        omim_options.add_argument('--use-cached-omim', help='Use parsed OMIM from google storage', action='store_true')
        omim_options.add_argument('--skip-omim', help="Don't reload gene constraint", action="store_true")

        for source in REFERENCE_DATA_SOURCES.keys():
            if source == 'omim':
                continue
            parser.add_argument(
                '--skip-{}'.format(source.replace('_', '-')), help="Don't reload {}".format(source), action="store_true"
            )

    def handle(self, *args, **options):
        should_skip = lambda source, data_handler: options[f'skip_{source}']
        data_handler_override = {}
        if not (options['use_cached_omim'] or options['skip_omim']):
            data_handler_override['omim'] = lambda: OmimReferenceDataHandler(options["omim_key"])

        self._update_all_reference_data_sources(should_skip, data_handler_override)

    @staticmethod
    def _update_gencode():
        # Download latest version first, and then add any genes from old releases not included in the latest release
        # Old gene ids are used in the gene constraint table and other datasets, as well as older sequencing data
        update_gencode(LATEST_GENCODE_RELEASE, reset=True)
        for release in OLD_GENCODE_RELEASES:
            update_gencode(release)

    @classmethod
    def _update_all_reference_data_sources(cls, should_skip, data_handler_override=None):
        updated = []
        update_failed = []

        for source, data_handler in REFERENCE_DATA_SOURCES.items():
            if not should_skip(source, data_handler):
                try:
                    if data_handler:
                        if data_handler_override and source in data_handler_override:
                            data_handler = data_handler_override[source]
                        update_records(data_handler())
                    elif source == "hpo":
                        update_hpo()
                    elif source == "gencode":
                        cls._update_gencode()
                    updated.append(source)
                except Exception as e:
                    logger.error("unable to update {}: {}".format(source, e))
                    update_failed.append(source)

        logger.info("Done")
        if updated:
            logger.info("Updated: {}".format(', '.join(updated)))
        if update_failed:
            logger.info("Failed to Update: {}".format(', '.join(update_failed)))
