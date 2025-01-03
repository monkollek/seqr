import glob
import gzip
import os
import subprocess # nosec

from seqr.utils.logging_utils import SeqrLogger

from urllib.parse import urlparse
import boto3
from settings import S3_ARN_ASSUME_ROLE

logger = SeqrLogger(__name__)


def run_command(command, user=None, pipe_errors=False):
    logger.info('==> {}'.format(command), user)
    return subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE if pipe_errors else subprocess.STDOUT, shell=True) # nosec


def _run_gsutil_command(command, gs_path, gunzip=False, user=None, pipe_errors=False, no_project=False):
    if not is_google_bucket_file_path(gs_path):
        raise Exception('A Google Storage path is expected.')

    #  Anvil buckets are requester-pays and we bill them to the anvil project
    google_project = get_google_project(gs_path) if not no_project else None
    project_arg = '-u {} '.format(google_project) if google_project else ''
    command = 'gsutil {project_arg}{command} {gs_path}'.format(
        project_arg=project_arg, command=command, gs_path=gs_path,
    )
    if gunzip:
        command += " | gunzip -c -q - "

    return run_command(command, user=user, pipe_errors=pipe_errors)


def is_google_bucket_file_path(file_path):
    return file_path.startswith("gs://")


# Code below is the s3 equivalent code that performs similar stuff to the gs code

def _is_s3_file_path(file_path):
    return file_path.startswith("s3://")
def parse_s3_path(s3path):
    parsed = urlparse(s3path)
    bucket = parsed.netloc
    path = parsed.path[1:]
    object_list = path.split('/')
    filename = object_list[-1]
    return {
        "bucket" : bucket,
        "key" : path,
        "filename" : filename
    }
#Need cross AWS account access
def create_s3_session():
    sts_client = boto3.client('sts')
    assumed_role_object = sts_client.assume_role(
        RoleArn=S3_ARN_ASSUME_ROLE,
        RoleSessionName='seqr'
    )
    credentials = assumed_role_object['Credentials']
    session = boto3.Session(
        aws_access_key_id=credentials['AccessKeyId'],
        aws_secret_access_key=credentials['SecretAccessKey'],
        aws_session_token=credentials['SessionToken']
    )
    return session

def get_google_project(gs_path):
    return 'anvil-datastorage' if gs_path.startswith('gs://fc-secure') else None


def does_file_exist(file_path, user=None):
    if is_google_bucket_file_path(file_path):
        process = _run_gsutil_command('ls', file_path, user=user)
        success = process.wait() == 0
        if not success:
            errors = [line.decode('utf-8').strip() for line in process.stdout]
            logger.info(' '.join(errors), user)
        return success

    # Equivalent code for s3
    elif _is_s3_file_path(file_path):
        if S3_ARN_ASSUME_ROLE == 'none':
            s3_client = boto3.client('s3')
        else:
            s3_client = create_s3_session().client('s3')
        parts = parse_s3_path(file_path)
        response = s3_client.list_objects(
            Bucket = parts['bucket'],
            Prefix = parts['key']
        )
        # This does not seem to be returning true?
        return 'Contents' in response and len(response['Contents']) > 0

    return os.path.isfile(file_path)


def list_files(wildcard_path, user):
    if is_google_bucket_file_path(wildcard_path):
        return get_gs_file_list(wildcard_path, user, check_subfolders=False, allow_missing=True)
    return [file_path for file_path in glob.glob(wildcard_path) if os.path.isfile(file_path)]


def file_iter(file_path, byte_range=None, raw_content=False, user=None, **kwargs):
    if is_google_bucket_file_path(file_path):
        for line in _google_bucket_file_iter(file_path, byte_range=byte_range, raw_content=raw_content, user=user, **kwargs):
            yield line
    # s3 equivalent code to the gs
    elif _is_s3_file_path(file_path):
        for line in _s3_file_iter(file_path,byte_range=byte_range):
            yield line    
    elif byte_range:
        command = 'dd skip={offset} count={size} bs=1 if={file_path} status="none"'.format(
            offset=byte_range[0],
            size=byte_range[1]-byte_range[0] + 1,
            file_path=file_path,
        )
        process = run_command(command, user=user)
        for line in process.stdout:
            yield line
    else:
        mode = 'rb' if raw_content else 'r'
        open_func = gzip.open if file_path.endswith("gz") else open
        with open_func(file_path, mode) as f:
            for line in f:
                yield line


def _google_bucket_file_iter(gs_path, byte_range=None, raw_content=False, user=None, **kwargs):
    """Iterate over lines in the given file"""
    range_arg = ' -r {}-{}'.format(byte_range[0], byte_range[1]) if byte_range else ''
    process = _run_gsutil_command(
        'cat{}'.format(range_arg), gs_path, gunzip=gs_path.endswith("gz") and not raw_content, user=user, **kwargs)
    for line in process.stdout:
        if not raw_content:
            line = line.decode('utf-8')
        yield line

def _s3_file_iter(file_path, byte_range = None):
    if S3_ARN_ASSUME_ROLE == 'none':
        client = boto3.client('s3')
    else:
        client = create_s3_session().client('s3')
    range_arg = f"bytes={byte_range[0]}-{byte_range[1]}" if byte_range else ''
    parts = parse_s3_path(file_path)
    r = client.get_object(
        Bucket=parts['bucket'],
        Key=parts['key'],
        Range=range_arg,
    )
    for line in r['Body']:
        yield line

def mv_file_to_gs(local_path, gs_path, user=None):
    command = 'mv {}'.format(local_path)
    run_gsutil_with_wait(command, gs_path, user)


def get_gs_file_list(gs_path, user=None, check_subfolders=True, allow_missing=False):
    gs_path = gs_path.rstrip('/')
    command = 'ls'

    if check_subfolders:
        # If a bucket is empty gsutil throws an error when running ls with ** instead of returning an empty list
        subfolders = _run_gsutil_with_stdout(command, gs_path, user)
        if not subfolders:
            return []
        gs_path = f'{gs_path}/**'

    all_lines = _run_gsutil_with_stdout(command, gs_path, user, allow_missing=allow_missing)
    return [line for line in all_lines if is_google_bucket_file_path(line)]


def run_gsutil_with_wait(command, gs_path, user=None):
    process = _run_gsutil_command(command, gs_path, user=user)
    if process.wait() != 0:
        errors = [line.decode('utf-8').strip() for line in process.stdout]
        raise Exception('Run command failed: ' + ' '.join(errors))
    return process


def _run_gsutil_with_stdout(command, gs_path, user=None, allow_missing=False):
    process = _run_gsutil_command(command, gs_path, user=user, pipe_errors=True)
    output, errs = process.communicate()
    if errs:
        errors = errs.decode('utf-8').strip().replace('\n', ' ')
        if allow_missing:
            logger.info(errors, user)
        else:
            raise Exception(f'Run command failed: {errors}')
    return [line for line in output.decode('utf-8').split('\n') if line]
