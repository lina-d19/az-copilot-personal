import azure.functions as func
import logging
import json

def main(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("Received GitHub callback request.")
    try:
        payload = req.get_body().decode()
        logging.info(f"Payload: {payload}")
    except Exception as e:
        logging.error(f"Failed to read payload: {e}")
        payload = None
    return func.HttpResponse("GitHub callback received.", status_code=200)
