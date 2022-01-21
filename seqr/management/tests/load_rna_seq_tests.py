# -*- coding: utf-8 -*-
import mock

from django.core.management import call_command
from django.test import TestCase

from seqr.models import Sample, RnaSeqOutlier
from seqr.views.utils.orm_to_json_utils import get_json_for_rna_seq_outliers

RNA_FILE_ID = 'tmp_-_2021-03-01T00:00:00_-_test_data_manager_-_new_muscle_samples.tsv.gz'
EXISTING_SAMPLE_GUID = 'S000150_na19675_d2'

class LoadRnaSeqTest(TestCase):
    fixtures = ['users', '1kg_project', 'reference_data']

    @mock.patch('seqr.views.apis.data_manager_api.ANALYST_PROJECT_CATEGORY', 'analyst-projects')
    @mock.patch('seqr.management.commands.load_rna_seq.logger.info')
    @mock.patch('seqr.management.commands.load_rna_seq.open')
    @mock.patch('seqr.views.apis.data_manager_api.gzip.open')
    def test_command(self, mock_gzip_open, mock_open, mock_logger):
        mock_gzip_file = mock_gzip_open.return_value.__enter__.return_value
        mock_gzip_file.__next__.return_value = 'sampleID\tgeneID\tdetail\tpValue\tpadjust\tzScore\n'
        mock_gzip_file.__iter__.return_value = [
            'NA19675_D2\tENSG00000240361\tdetail1\t0.01\t0.13\t-3.1\n',
            'NA19675_D2\tENSG00000240361\tdetail2\t0.01\t0.13\t-3.1\n',
            'NA19675_D2\tENSG00000233750\tdetail1\t0.064\t0.0000057\t7.8\n',
            'NA19675_D3\tENSG00000233750\tdetail1\t0.064\t0.0000057\t7.8\n',
        ]
        mock_open.return_value.__enter__.return_value.__iter__.return_value = ['NA19675_D2\tNA19675_1']

        with self.assertRaises(ValueError) as e:
            call_command('load_rna_seq', RNA_FILE_ID)
        self.assertEqual(str(e.exception), 'Unable to find matches for the following samples: NA19675_D2, NA19675_D3')

        with self.assertRaises(ValueError) as e:
            call_command('load_rna_seq', RNA_FILE_ID, '--mapping-file', 'map.tsv')
        self.assertEqual(str(e.exception), 'Unable to find matches for the following samples: NA19675_D3')

        call_command('load_rna_seq', RNA_FILE_ID, '--mapping-file', 'map.tsv', '--ignore-extra-samples')

        rna_samples = Sample.objects.filter(individual_id=1, sample_id='NA19675_D2', sample_type='RNA')
        self.assertEqual(len(rna_samples), 2)
        existing_sample = next(s for s in rna_samples if s.guid == EXISTING_SAMPLE_GUID)
        self.assertFalse(existing_sample.is_active)
        new_sample = next(s for s in rna_samples if s.guid != EXISTING_SAMPLE_GUID)
        self.assertTrue(new_sample.is_active)
        self.assertIsNone(new_sample.elasticsearch_index)
        self.assertEqual(new_sample.data_source, 'new_muscle_samples.tsv.gz')

        models = RnaSeqOutlier.objects.all()
        self.assertEqual(models.count(), 2)
        self.assertSetEqual({model.sample for model in models}, {new_sample})
        self.assertListEqual(get_json_for_rna_seq_outliers(models), [
            {'geneId': 'ENSG00000240361', 'pAdjust': 0.13, 'pValue': 0.01, 'zScore': -3.1, 'isSignificant': False},
            {'geneId': 'ENSG00000233750', 'pAdjust': 0.0000057, 'pValue': 0.064, 'zScore': 7.8, 'isSignificant': True},
        ])
        mock_logger.assert_called_with('create 2 RnaSeqOutliers for NA19675_D2')

