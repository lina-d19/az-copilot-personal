import azure.functions as func
import logging
import json
from common import load_json_from_blob, build_params_dict, log_interaction

def main(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("Processing check_errors request")
    region = req.params.get("region")
    code = req.params.get("code")
    date = req.params.get("date")
    start_date = req.params.get("start_date")
    end_date = req.params.get("end_date")

    errors_blob = load_json_from_blob("errors.json")
    errors = errors_blob.get("errorEntries", []) if isinstance(errors_blob, dict) else errors_blob
    filtered = []
    for e in errors:
        if region and e.get("region", "").lower() != region.lower():
            continue
        if code and str(e.get("errorCode", "")) != str(code):
            continue
        timestamp = e.get("timestamp", "")
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
        filtered.append(e)

    total_errors = sum(e.get("errorCount", 1) for e in filtered)
    response = {"totalErrors": total_errors}
    params = build_params_dict(region=region, code=code, date=date, start_date=start_date, end_date=end_date)
    log_interaction(
        "check-errors",
        params,
        response,
        func.datetime.datetime.utcnow().isoformat() + "Z"
    )
    return func.HttpResponse(json.dumps(response), mimetype="application/json")
