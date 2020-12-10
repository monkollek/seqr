import mock
import responses

from django.test import TestCase
from django.contrib.auth.models import User

from seqr.views.utils.test_utils import TEST_TERRA_API_ROOT_URL
from seqr.views.utils.terra_api_utils import list_anvil_workspaces, user_get_workspace_acl,\
    anvil_call, user_get_workspace_access_level, TerraNotFoundException, TerraAPIException
from seqr.views.utils.test_utils import GOOGLE_API_TOKEN_URL, GOOGLE_TOKEN_RESULT, GOOGLE_ACCESS_TOKEN_URL,\
    TOKEN_AUTH_TIME, REGISTER_RESPONSE

AUTH_EXTRA_DATA = {"expires": 3599, "auth_time": TOKEN_AUTH_TIME, "token_type": "Bearer", "access_token": "ya29.EXAMPLE"}
LIST_WORKSPACE_RESPONSE = '[{"accessLevel": "PROJECT_OWNER", "public": false, "workspace": {"attributes": {"description": "Workspace for seqr project"}, "authorizationDomain": [], "bucketName": "fc-237998e6-663d-40b9-bd13-57c3bb6ac593", "createdBy": "test1@test.com", "createdDate": "2020-09-09T15:10:32.816Z", "isLocked": false, "lastModified": "2020-09-09T15:10:32.818Z", "name": "1000 Genomes Demo", "namespace": "my-seqr-billing", "workflowCollectionName": "237998e6-663d-40b9-bd13-57c3bb6ac593", "workspaceId": "237998e6-663d-40b9-bd13-57c3bb6ac593" }, "workspaceSubmissionStats": {"runningSubmissionsCount": 0}},\
{"accessLevel": "READER","public": true, "workspace": {"attributes": {"tag:tags": {"itemsType": "AttributeValue","items": ["differential-expression","tutorial"]},"description": "[DEGenome](https://github.com/eweitz/degenome) transforms differential expression data into inputs for [exploratory genome analysis with Ideogram.js](https://eweitz.github.io/ideogram/differential-expression?annots-url=https://www.googleapis.com/storage/v1/b/degenome/o/GLDS-4_array_differential_expression_ideogram_annots.json).  \\n\\nTry the [Notebook tutorial](https://app.terra.bio/#workspaces/degenome/degenome/notebooks/launch/degenome-tutorial.ipynb), where you can step through using DEGenome to analyze expression for mice flown in space!"},"authorizationDomain": [],"bucketName": "fc-2706d493-5fce-4fb2-9993-457c30364a06","createdBy": "test2@test.com","createdDate": "2020-01-14T10:21:14.575Z","isLocked": false,"lastModified": "2020-02-01T13:28:27.309Z","name": "degenome","namespace": "degenome","workflowCollectionName": "2706d493-5fce-4fb2-9993-457c30364a06","workspaceId": "2706d493-5fce-4fb2-9993-457c30364a06"},"workspaceSubmissionStats": {"runningSubmissionsCount": 0}},\
{"accessLevel": "PROJECT_OWNER","public": false, "workspace": {"attributes": {"description": "A workspace for seqr project"},"authorizationDomain": [],"bucketName": "fc-6a048145-c134-4004-a009-42824f826ee8","createdBy": "test3@test.com","createdDate": "2020-09-09T15:12:30.142Z","isLocked": false,"lastModified": "2020-09-09T15:12:30.145Z","name": "seqr-project 1000 Genomes Demo","namespace": "my-seqr-billing","workflowCollectionName": "6a048145-c134-4004-a009-42824f826ee8","workspaceId": "6a048145-c134-4004-a009-42824f826ee8"},"workspaceSubmissionStats": {"runningSubmissionsCount": 0}}]'


@mock.patch('seqr.views.utils.terra_api_utils.TERRA_API_ROOT_URL', TEST_TERRA_API_ROOT_URL)
@mock.patch('seqr.views.utils.terra_api_utils.logger')
class TerraApiUtilsCase(TestCase):
    fixtures = ['users', 'social_auth']

    @responses.activate
    def test_anvil_call(self, mock_logger):
        url = '{}register'.format(TEST_TERRA_API_ROOT_URL)
        responses.add(responses.GET, url, status=200, body=REGISTER_RESPONSE)
        r = anvil_call('get', 'register', 'ya.EXAMPLE')
        self.assertDictEqual(r['userInfo'], { "userEmail": "test@test.com", "userSubjectId": "123456"})
        mock_logger.info.assert_called_with('GET https://terra.api/register 200 127 None')
        self.assertEqual(len(mock_logger.method_calls), 1)

        mock_logger.reset_mock()
        responses.replace(responses.GET, url, status=404, body='{"causes": [], "message": "google subject Id 123456 not found in sam", "source": "sam", "stackTrace": [], "statusCode": 404, "timestamp": 1605282720182}')
        with self.assertRaises(TerraNotFoundException) as te:
            _ = anvil_call('get', 'register', 'ya.EXAMPLE')
        self.assertEqual(str(te.exception), 'None called Terra API: GET /register got status 404 with reason: Not Found')
        self.assertEqual(len(mock_logger.method_calls), 0)

    @responses.activate
    @mock.patch('seqr.views.utils.terra_api_utils.time')
    def test_list_workspaces(self, mock_time, mock_logger):
        user = User.objects.get(email='test_user@test.com')
        responses.add(responses.POST, GOOGLE_API_TOKEN_URL, status=200, body=GOOGLE_TOKEN_RESULT)
        mock_time.time.return_value = AUTH_EXTRA_DATA['auth_time'] + 10

        url = '{}api/workspaces'.format(TEST_TERRA_API_ROOT_URL)
        responses.add(responses.GET, url, status = 200, body = LIST_WORKSPACE_RESPONSE)
        workspaces = list_anvil_workspaces(user)
        self.assertEqual(len(workspaces), 3)
        self.assertDictEqual(workspaces[0], {"accessLevel": "PROJECT_OWNER", "public": False, "workspace": {"attributes": {"description": "Workspace for seqr project"}, "authorizationDomain": [], "bucketName": "fc-237998e6-663d-40b9-bd13-57c3bb6ac593", "createdBy": "test1@test.com", "createdDate": "2020-09-09T15:10:32.816Z", "isLocked": False, "lastModified": "2020-09-09T15:10:32.818Z", "name": "1000 Genomes Demo", "namespace": "my-seqr-billing", "workflowCollectionName": "237998e6-663d-40b9-bd13-57c3bb6ac593", "workspaceId": "237998e6-663d-40b9-bd13-57c3bb6ac593" }, "workspaceSubmissionStats": {"runningSubmissionsCount": 0}})
        mock_logger.info.assert_called_with('GET https://terra.api/api/workspaces 200 2348 test_user')
        self.assertEqual(len(mock_logger.method_calls), 1)

        mock_logger.reset_mock()
        responses.reset()
        responses.add(responses.POST, GOOGLE_API_TOKEN_URL, status = 200, body = GOOGLE_TOKEN_RESULT)
        responses.add(responses.GET, url+'?fields=accessLevel,workspace.name,workspace.namespace,workspace.workspaceId', status = 200,
            body = '[{"accessLevel": "PROJECT_OWNER", "workspace": {"name": "1000 Genomes Demo", "namespace": "my-seqr-billing", "workspaceId": "237998e6-663d-40b9-bd13-57c3bb6ac593" }},'
                   '{"accessLevel": "READER","workspace": {"name": "degenome","namespace": "degenome", "workspaceId": "2706d493-5fce-4fb2-9993-457c30364a06"}},'
                   '{"accessLevel": "PROJECT_OWNER","workspace": {"name": "seqr-project 1000 Genomes Demo","namespace": "my-seqr-billing","workspaceId": "6a048145-c134-4004-a009-42824f826ee8"}}]')
        workspaces = list_anvil_workspaces(user,
            fields='accessLevel,workspace.name,workspace.namespace,workspace.workspaceId')
        self.assertNotIn('public', workspaces[0].keys())
        mock_logger.info.assert_called_with('GET https://terra.api/api/workspaces?fields=accessLevel,workspace.name,workspace.namespace,workspace.workspaceId 200 479 test_user')
        self.assertEqual(len(mock_logger.method_calls), 1)

        mock_logger.reset_mock()
        responses.add(responses.GET, url, status = 401)
        with self.assertRaises(Exception) as ec:
            _ = list_anvil_workspaces(user)
        self.assertEqual(str(ec.exception),
            'Error: called Terra API: GET /api/workspaces got status: 401 with a reason: Unauthorized')
        mock_logger.error.assert_called_with('GET https://terra.api/api/workspaces 401 0 test_user')
        self.assertEqual(len(mock_logger.method_calls), 1)

        mock_time.reset_mock()
        mock_time.time.return_value = AUTH_EXTRA_DATA['auth_time'] + 60*60 + 10
        mock_logger.reset_mock()
        responses.add(responses.POST, GOOGLE_ACCESS_TOKEN_URL, status = 401)
        with self.assertRaises(TerraAPIException) as te:
            _ = list_anvil_workspaces(user)
        self.assertEqual(str(te.exception),
            'Refresh token failed. 401 Client Error: Unauthorized for url: https://accounts.google.com/o/oauth2/token')
        mock_logger.warning.assert_called_with('Refresh token failed. 401 Client Error: Unauthorized for url: https://accounts.google.com/o/oauth2/token')
        self.assertEqual(len(mock_logger.method_calls), 1)

    @responses.activate
    @mock.patch('seqr.views.utils.terra_api_utils.time')
    def test_get_workspace_acl(self, mock_time, mock_logger):
        user = User.objects.get(email='test_user@test.com')
        responses.add(responses.POST, GOOGLE_API_TOKEN_URL, status=200, body=GOOGLE_TOKEN_RESULT)
        mock_time.time.return_value = AUTH_EXTRA_DATA['auth_time'] + 10

        url = '{}api/workspaces/my-seqr-billing/my-seqr-workspace/acl'.format(TEST_TERRA_API_ROOT_URL)
        responses.add(responses.GET, url, status = 200, body = '{"acl": {"test1@test1.com": {"accessLevel": "OWNER","canCompute": true,"canShare": true,"pending": false},"sf-seqr@my-seqr.iam.gserviceaccount.com": {"accessLevel": "OWNER","canCompute": true,"canShare": true,"pending": false},"test2@test2.org": {"accessLevel": "OWNER","canCompute": true,"canShare": true,"pending": false},"test3@test3.com": {"accessLevel": "READER","canCompute": false,"canShare": false,"pending": false}}}')
        acl = user_get_workspace_acl(user, 'my-seqr-billing', 'my-seqr-workspace')
        self.assertIn('test3@test3.com', acl.keys())
        mock_logger.info.assert_called_with(
            'GET https://terra.api/api/workspaces/my-seqr-billing/my-seqr-workspace/acl 200 425 test_user')
        self.assertEqual(len(mock_logger.method_calls), 1)

        mock_logger.reset_mock()
        responses.replace(responses.GET, url, status = 401)
        with self.assertRaises(TerraAPIException) as ec:
            _ = user_get_workspace_acl(user, 'my-seqr-billing', 'my-seqr-workspace')
        self.assertEqual(str(ec.exception),
            'Error: called Terra API: GET /api/workspaces/my-seqr-billing/my-seqr-workspace/acl got status: 401 with a reason: Unauthorized')
        mock_logger.error.assert_called_with(
            'GET https://terra.api/api/workspaces/my-seqr-billing/my-seqr-workspace/acl 401 0 test_user')
        self.assertEqual(len(mock_logger.method_calls), 1)

        mock_logger.reset_mock()
        responses.replace(responses.GET, url, status = 403)
        r = user_get_workspace_acl(user, 'my-seqr-billing', 'my-seqr-workspace')
        self.assertDictEqual(r, {})
        mock_logger.warning.assert_called_with(
            'test_user got access denied (403) from Terra API: GET /api/workspaces/my-seqr-billing/my-seqr-workspace/acl with reason: Forbidden')
        self.assertEqual(len(mock_logger.method_calls), 1)

        mock_logger.reset_mock()
        responses.replace(responses.GET, url, status = 404)
        r = user_get_workspace_acl(user, 'my-seqr-billing', 'my-seqr-workspace')
        self.assertDictEqual(r, {})
        mock_logger.warning.assert_called_with(
            'test_user called Terra API: GET /api/workspaces/my-seqr-billing/my-seqr-workspace/acl got status 404 with reason: Not Found')
        self.assertEqual(len(mock_logger.method_calls), 1)

    @responses.activate
    @mock.patch('seqr.views.utils.terra_api_utils.time')
    def test_user_get_workspace_access_level(self, mock_time, mock_logger):
        user = User.objects.get(email='test_user@test.com')
        responses.add(responses.POST, GOOGLE_API_TOKEN_URL, status=200, body=GOOGLE_TOKEN_RESULT)
        mock_time.time.return_value = AUTH_EXTRA_DATA['auth_time'] + 10

        url = '{}api/workspaces/my-seqr-billing/my-seqr-workspace?fields=accessLevel'.format(TEST_TERRA_API_ROOT_URL)
        responses.add(responses.GET, url, status = 200, body = '{"accessLevel": "OWNER"}')
        permission = user_get_workspace_access_level(user, 'my-seqr-billing', 'my-seqr-workspace')
        self.assertDictEqual(permission, {"accessLevel": "OWNER"})
        mock_logger.info.assert_called_with(
            'GET https://terra.api/api/workspaces/my-seqr-billing/my-seqr-workspace?fields=accessLevel 200 24 test_user')
        self.assertEqual(len(mock_logger.method_calls), 1)

        mock_logger.reset_mock()
        responses.replace(responses.GET, url, status = 404)
        permission = user_get_workspace_access_level(user, 'my-seqr-billing', 'my-seqr-workspace')
        self.assertDictEqual(permission, {})
        mock_logger.warning.assert_called_with(
            'test_user called Terra API: GET /api/workspaces/my-seqr-billing/my-seqr-workspace?fields=accessLevel got status 404 with reason: Not Found')
        self.assertEqual(len(mock_logger.method_calls), 1)