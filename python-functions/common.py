import azure.functions as func
import datetime
import json
import logging
from azure.storage.blob import BlobServiceClient
from azure.identity import DefaultAzureCredential
import os

def load_json_from_blob(blob_name):
    credential = DefaultAzureCredential()
    account_url = os.environ.get("BLOB_ACCOUNT_URL")
    logging.info(f"BLOB_ACCOUNT_URL: {account_url}")
    container_name = "telemetry"
    blob_service_client = BlobServiceClient(account_url=account_url, credential=credential)
    container_client = blob_service_client.get_container_client(container_name)
    blob_client = container_client.get_blob_client(blob_name)
    try:
        download_stream = blob_client.download_blob()
        data = json.loads(download_stream.readall())
    except Exception as e:
        logging.error(f"Failed to load {blob_name} from blob: {e}")
        data = []
    return data

def build_params_dict(**kwargs):
    return {k: v for k, v in kwargs.items() if v is not None and v != ""}

def log_interaction(query, parameters, response, timestamp, log_file="interactions-log.json"):
    connection_string = os.environ.get("AzureWebJobsStorage")
    container_name = "telemetry"
    blob_name = log_file
    blob_service_client = BlobServiceClient.from_connection_string(connection_string)
    container_client = blob_service_client.get_container_client(container_name)
    blob_client = container_client.get_blob_client(blob_name)
    try:
        download_stream = blob_client.download_blob()
        logs = json.loads(download_stream.readall())
    except Exception:
        logs = []
    logs.append({
        "query": query,
        "parameters": parameters,
        "response": response,
        "timestamp": timestamp
    })
    blob_client.upload_blob(json.dumps(logs, indent=2), overwrite=True, content_settings=None)
