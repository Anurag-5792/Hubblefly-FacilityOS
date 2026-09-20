app_name = "facility_os"
app_title = "FacilityOS"
app_publisher = "Hubblefly Technologies Limited"
app_description = "Operational inventory, physical location, reconciliation and MIS layer for ERPNext"
app_email = ""
app_license = "Proprietary"

after_install = "facility_os.install.after_install"

scheduler_events = {
    "hourly": [
        "facility_os.sync.run_incremental_sync",
    ],
}
