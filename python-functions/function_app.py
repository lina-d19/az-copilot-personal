import azure.functions as func
import datetime
import json
import logging
from azure.storage.blob import BlobServiceClient
from azure.identity import DefaultAzureCredential
import os

app = func.FunctionApp()

def load_json_from_blob(blob_name):
    credential = DefaultAzureCredential()
    account_url = os.environ.get("BLOB_ACCOUNT_URL")  # e.g., https://<storage-account-name>.blob.core.windows.net
    container_name = "telemetry"  # Change if your container is named differently
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
    """Helper to build a dict with only non-None, non-empty values."""
    return {k: v for k, v in kwargs.items() if v is not None and v != ""}

@app.route(route="get_latency")
def get_latency(req: func.HttpRequest) -> func.HttpResponse:
    logging.info('Processing get_latency request.')
    region = req.params.get("region")
    regions = req.params.get("regions")  # comma-separated list for comparison
    date = req.params.get("date")
    start_date = req.params.get("start_date")
    end_date = req.params.get("end_date")
    compare = req.params.get("compare")  # if 'true', compare regions
    update_timestamp = req.params.get("update_timestamp")

    latency_data = load_json_from_blob("latency.json")

    # Format average latency to integer (no decimals)
    def format_float(val):
        return int(round(val)) if isinstance(val, float) else val

    # If comparing multiple regions
    if regions:
        region_list = [r.strip().lower() for r in regions.split(",") if r.strip()]
        region_latencies = {}
        for reg in region_list:
            reg_entries = []
            for entry in latency_data:
                if entry.get("region", "").lower() != reg:
                    continue
                timestamp = entry.get("timestamp", "")
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
                reg_entries.append(entry)
            avg = sum(e.get('latencyMs', 0) for e in reg_entries) / len(reg_entries) if reg_entries else 0
            region_latencies[reg] = format_float(avg)
        response = {"regionLatencies": region_latencies}
        params = build_params_dict(regions=regions, date=date, start_date=start_date, end_date=end_date, compare=compare)
        timestamp = datetime.datetime.utcnow().isoformat() + "Z"
        log_interaction("get-latency", params, response, timestamp)
        return func.HttpResponse(json.dumps(response), mimetype="application/json")

    # If compare is true, return all region averages and the highest
    if compare == "true":
        region_groups = {}
        for entry in latency_data:
            reg = entry.get("region", "").lower()
            timestamp = entry.get("timestamp", "")
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
            region_groups.setdefault(reg, []).append(entry)
        region_latencies = {reg: format_float(sum(e.get('latencyMs', 0) for e in entries) / len(entries) if entries else 0) for reg, entries in region_groups.items()}
        if region_latencies:
            highest_region = max(region_latencies, key=region_latencies.get)
            response = {"regionLatencies": region_latencies, "highestLatencyRegion": highest_region, "highestLatencyMs": format_float(region_latencies[highest_region])}
        else:
            response = {"regionLatencies": {}, "highestLatencyRegion": None, "highestLatencyMs": 0}
        params = build_params_dict(date=date, start_date=start_date, end_date=end_date, compare=compare)
        timestamp = datetime.datetime.utcnow().isoformat() + "Z"
        log_interaction("get-latency", params, response, timestamp)
        return func.HttpResponse(json.dumps(response), mimetype="application/json")

    # If update_timestamp is provided, compare latency before and after update (optionally for a region)
    if update_timestamp:
        try:
            update_dt = datetime.datetime.fromisoformat(update_timestamp.replace("Z", ""))
        except Exception:
            response = {"error": "Invalid update_timestamp format. Use ISO format (e.g., 2025-05-25T12:00:00Z)"}
            return func.HttpResponse(json.dumps(response), status_code=400, mimetype="application/json")

        before_entries = []
        after_entries = []
        for entry in latency_data:
            # If region is specified, only consider that region
            if region and entry.get("region", "").lower() != region.lower():
                continue
            ts = entry.get("timestamp", "")
            try:
                entry_dt = datetime.datetime.fromisoformat(ts.replace("Z", ""))
            except Exception:
                continue
            if entry_dt < update_dt:
                before_entries.append(entry)
            else:
                after_entries.append(entry)
        avg_before = sum(e.get('latencyMs', 0) for e in before_entries) / len(before_entries) if before_entries else 0
        avg_after = sum(e.get('latencyMs', 0) for e in after_entries) / len(after_entries) if after_entries else 0
        went_up = avg_after > avg_before
        response = {
            "averageLatencyBefore": format_float(avg_before),
            "averageLatencyAfter": format_float(avg_after),
            "latencyWentUp": went_up,
            "message": (
                f"Latency increased after the update{' in ' + region if region else ''}." if went_up else (
                    f"Latency decreased after the update{' in ' + region if region else ''}." if avg_after < avg_before else f"Latency stayed the same after the update{' in ' + region if region else ''}."
                )
            )
        }
        params = build_params_dict(update_timestamp=update_timestamp, region=region)
        timestamp = datetime.datetime.utcnow().isoformat() + "Z"
        log_interaction("get-latency", params, response, timestamp)
        return func.HttpResponse(json.dumps(response), mimetype="application/json")

    # Default: filter by single region or all
    filtered = []
    for entry in latency_data:
        if region and entry.get("region", "").lower() != region.lower():
            continue
        timestamp = entry.get("timestamp", "")
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
        filtered.append(entry)

    avg_latency = (
        sum(entry.get('latencyMs', 0) for entry in filtered) / len(filtered)
        if filtered else 0
    )
    response = {"averageLatencyMs": format_float(avg_latency)}
    params = build_params_dict(region=region, date=date, start_date=start_date, end_date=end_date)
    timestamp = datetime.datetime.utcnow().isoformat() + "Z"
    log_interaction("get-latency", params, response, timestamp)
    return func.HttpResponse(json.dumps(response), mimetype="application/json")

@app.route(route="check_errors")
def check_errors(req: func.HttpRequest) -> func.HttpResponse:
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
        # Region and code filtering
        if region and e.get("region", "").lower() != region.lower():
            continue
        if code and str(e.get("errorCode", "")) != str(code):
            continue
        # Date filtering
        timestamp = e.get("timestamp", "")
        if start_date and end_date:
            # Assume timestamp is in ISO format, compare date part only
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
        datetime.datetime.utcnow().isoformat() + "Z"
    )
    return func.HttpResponse(json.dumps(response), mimetype="application/json")

@app.route(route="list_incidents")
def list_incidents(req: func.HttpRequest) -> func.HttpResponse:
    logging.info('Processing list_incidents request.')
    region = req.params.get("region")
    status = req.params.get("status")
    date = req.params.get("date")
    start_date = req.params.get("start_date")
    end_date = req.params.get("end_date")

    incidents_data = load_json_from_blob("incidents.json")
    filtered = []
    for i in incidents_data:
        # Region filtering
        if region and i.get("region", "").lower() != region.lower():
            continue
        # Status filtering
        if status and i.get("status", "").lower() != status.lower():
            continue
        # Date filtering
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

@app.route(route="github/callback", methods=["GET", "POST"])
def github_callback(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("Received GitHub callback request.")
    try:
        payload = req.get_body().decode()
        logging.info(f"Payload: {payload}")
    except Exception as e:
        logging.error(f"Failed to read payload: {e}")
        payload = None
    return func.HttpResponse("GitHub callback received.", status_code=200)

def log_interaction(query, parameters, response, timestamp, log_file="interactions-log.json"):
    # Use Azure Blob Storage for logging
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