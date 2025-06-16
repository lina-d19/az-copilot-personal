import logging
import azure.functions as func
import os
from azure.storage.blob import BlobServiceClient
import json
from datetime import datetime

def main(req: func.HttpRequest) -> func.HttpResponse:
    logging.info('Python HTTP trigger function processed a request for logging.')

    try:
        log_data = req.get_json()
    except ValueError:
        return func.HttpResponse(
            'Invalid JSON in request body.',
            status_code=400
        )

    # Azure Blob Storage setup
    connect_str = os.getenv('AzureWebJobsStorage')
    container_name = 'telemetry'
    blob_name = 'copilot-logs.json'  # Changed from .jsonl to .json
    blob_service_client = BlobServiceClient.from_connection_string(connect_str)
    blob_client = blob_service_client.get_blob_client(container=container_name, blob=blob_name)

    # Download existing log file (if it exists)
    try:
        existing_data = blob_client.download_blob().readall().decode('utf-8')
    except Exception:
        existing_data = ''  # File may not exist yet

    # Prepare new log entry (as a JSON array)
    try:
        logs = json.loads(existing_data) if existing_data else []
    except Exception:
        logs = []
    logs.append(log_data)
    updated_data = json.dumps(logs, indent=2)

    # Upload the updated log file (overwrite)
    try:
        blob_client.upload_blob(updated_data, overwrite=True)
        logging.info('Successfully wrote log to blob.')
    except Exception as e:
        logging.error(f'Failed to write log to blob: {e}')
        return func.HttpResponse(
            f'Failed to write log to blob: {e}\nLogs attempted: {updated_data[:500]}',
            status_code=500
        )

    return func.HttpResponse('Log appended to copilot-logs.json.', status_code=200)
