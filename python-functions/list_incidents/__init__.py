import azure.functions as func
import logging
import json
import datetime
from common import load_json_from_blob, build_params_dict, log_interaction

def main(req: func.HttpRequest) -> func.HttpResponse:
    logging.info('Processing list_incidents request.')
    region = req.params.get("region")
    status = req.params.get("status")
    date = req.params.get("date")
    start_date = req.params.get("start_date")
    end_date = req.params.get("end_date")

    incidents_data = load_json_from_blob("incidents.json")
    filtered = []
    for i in incidents_data:
        if region and i.get("region", "").lower() != region.lower():
            continue
        if status and i.get("status", "").lower() != status.lower():
            continue
        timestamp = i.get("timestamp", "")
        if start_date and end_date:
            try:
                ts_date = timestamp[:10]
                if not (start_date <= ts_date <= end_date):
                    continue
            except Exception:
                continue
        elif date:
            if not timestamp.startswith(date):
                continue
        filtered.append(i)

    response = {"incidents": filtered}
    params = build_params_dict(region=region, status=status, date=date, start_date=start_date, end_date=end_date)
    timestamp = datetime.datetime.utcnow().isoformat() + "Z"
    log_interaction("list-incidents", params, response, timestamp)
    return func.HttpResponse(json.dumps(response), mimetype="application/json")
