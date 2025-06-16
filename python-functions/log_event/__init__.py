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
    blob_service_client = BlobServiceClient.from_connection_string(connect_str)

    # Create a unique blob name with timestamp
    timestamp = datetime.utcnow().strftime('%Y%m%dT%H%M%S%f')
    blob_name = f'copilotlog_{timestamp}.json'
    blob_client = blob_service_client.get_blob_client(container=container_name, blob=blob_name)

    # Write the log data as JSON
    try:
        blob_client.upload_blob(json.dumps(log_data), overwrite=True)
    except Exception as e:
        logging.error(f'Failed to write log to blob: {e}')
        return func.HttpResponse(
            f'Failed to write log to blob: {e}',
            status_code=500
        )

    return func.HttpResponse('Log written to Azure Blob Storage.', status_code=200)
