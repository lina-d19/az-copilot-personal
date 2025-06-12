import azure.functions as func
import datetime
import json
import logging
from common import load_json_from_blob, build_params_dict, log_interaction

def main(req: func.HttpRequest) -> func.HttpResponse:
    logging.info('Processing get_latency request.')
    region = req.params.get("region")
    regions = req.params.get("regions")
    date = req.params.get("date")
    start_date = req.params.get("start_date")
    end_date = req.params.get("end_date")
    compare = req.params.get("compare")
    update_timestamp = req.params.get("update_timestamp")

    latency_data = load_json_from_blob("latency.json")

    def format_float(val):
        return int(round(val)) if isinstance(val, float) else val

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

    if update_timestamp:
        try:
            update_dt = datetime.datetime.fromisoformat(update_timestamp.replace("Z", ""))
        except Exception:
            response = {"error": "Invalid update_timestamp format. Use ISO format (e.g., 2025-05-25T12:00:00Z)"}
            return func.HttpResponse(json.dumps(response), status_code=400, mimetype="application/json")

        before_entries = []
        after_entries = []
        for entry in latency_data:
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
