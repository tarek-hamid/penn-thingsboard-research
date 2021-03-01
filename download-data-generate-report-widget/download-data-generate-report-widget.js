self.onInit = function() {

    var configObject = {
        maxDays: 30
    };

    $('#datePicker').dateRangePicker(configObject);

    var downloadButton = document.getElementById(
            "download"),
        reportButton = document.getElementById(
            "report");

    getDevices();

    downloadButton.onclick = function() {
        var action = "download"
        buttonClickAction(action);
    }

    reportButton.onclick = function() {
        var action = "generate report"
        buttonClickAction(action);
    }
}

self.onDestroy = function() {}

const buttonClickAction = function(action) {
    const http = self.ctx.http;

    var select = document.getElementById("select"),
        date = document.getElementById("datePicker");

    var deviceId = select.value,
        deviceName = select.options[select
            .selectedIndex].text

    var dates = date.value.split(' '),
        startDate = moment(dates[0] +
            ' 00:00:00'),
        endDate = moment(dates[2] +
            ' 23:59:59');

    var limit = (endDate / 1000) - (startDate /
        1000) + 1;

    if (!select.value || !date.value) {
        document.getElementById("user-interaction")
            .textContent =
            'Please select a device and date range.'
        return
    }

    $("#download").prop('disabled', true)
    $("#report").prop('disabled', true)
    $("#select").prop('disabled', true)
    $("#datePicker").prop('disabled', true)
    document.getElementById("user-interaction")
        .textContent = 'Processing...'

    // call data query api
    const result = http.get(
        '/api/plugins/telemetry/DEVICE/' +
        deviceId.toString() +
        '/values/timeseries?keys=data' +
        '&limit=' + limit + '&startTs=' +
        startDate + '&endTs=' + endDate, {
            headers: {
                'Content-type': 'application/json'
            }
        });

    if (action == "download") {
        result.forEach((data) => {
            downloadData(dataToCsv(data),
                deviceName,
                startDate, endDate);
        });
    }

    if (action == "generate report") {
        result.forEach((data) => {
            downloadData(analyzeData(data),
                deviceName, startDate,
                endDate)
        });
    }
}

const analyzeData = function(data) {
    const csvRows = [];
    const dataReport = {
        timeAbove94: 0,
        timeBetween90And94: 0,
        timeBetween85and89: 0,
        timeBetween80and84: 0,
        timeBelow80: 0
    };

    for (i = data.data.length - 1; i >= 0; i--) {
        var value = formatJsonData(data.data[i].value)
        for (const key in value) {
            var variable = value[key].split(':')[0]
            var spo2Value = value[key].split(':')[1]
            if (variable == "SpO2") {
                if (spo2Value >= 95) {
                    dataReport['timeAbove94'] += 1
                } else if (spo2Value >= 90) {
                    dataReport['timeBetween90And94'] +=
                        1
                } else if (spo2Value >= 85) {
                    dataReport['timeBetween85and89'] +=
                        1
                } else if (spo2Value >= 80) {
                    dataReport['timeBetween80and84'] +=
                        1
                } else {
                    dataReport['timeBelow80'] += 1
                }
            }
        }
    }
    
    var newRow = "This report shows total oxygen saturation concentrations at various levels."
    csvRows.push(newRow)

    var newRow =
        'Total time at 95% oxygen saturation or above (seconds), '
    newRow += dataReport['timeAbove94']
    csvRows.push(newRow)

    newRow =
        'Total time between 90-94% oxygen saturation (seconds), '
    newRow += dataReport['timeBetween90And94']
    csvRows.push(newRow)

    newRow =
        'Total time between 85-89% oxygen saturation (seconds), '
    newRow += dataReport['timeBetween85and89']
    csvRows.push(newRow)

    newRow =
        'Total time between 80-84% oxygen saturation (seconds), '
    newRow += dataReport['timeBetween80and84']
    csvRows.push(newRow)

    newRow = 'Total time below 80% oxygen saturation (seconds), '
    newRow += dataReport['timeBelow80']
    csvRows.push(newRow)

    return csvRows.join('\n')
}

const dataToCsv = function(data) {
    const csvRows = [];

    // get headers and populate csvRows
    var headers = Object.keys(data.data[0])[0]
    var unformattedHeaders = data.data[0].value
    var additionalHeaders = formatJsonData(
        unformattedHeaders)
    for (const key in additionalHeaders) {
        newHeader = additionalHeaders[key].split(':')[0]
        headers += ',' + newHeader
    }

    csvRows.push(headers)

    // populate CSV with data
    for (i = data.data.length - 1; i >= 0; i--) {
        var newRow = moment(data.data[i].ts).format(
            'YYYY-MM-DD HH:mm:ss')
        var value = formatJsonData(data.data[i].value)
        for (const key in value) {
            var newValue = value[key].split(':')[1]
            newRow += ',' + newValue
        }
        csvRows.push(newRow)
    }

    return csvRows.join('\n')
}

const downloadData = function(data, deviceName, startDate,
    endDate) {

    const blob = new Blob([data], {
        type: 'text/csv'
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);

    // Setting document name
    startDate = moment(startDate).format('YYYY-MM-DD')
    endDate = moment(endDate).format('YYYY-MM-DD')
    documentName = String(deviceName) + '_' +
        startDate + '_to_' + endDate
    a.setAttribute('download', documentName + '.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Reset card
    $("#download").removeAttr('disabled')
    $("#report").removeAttr('disabled')
    $("#select").removeAttr('disabled')
    $("#datePicker").removeAttr('disabled')
    document.getElementById("user-interaction")
        .textContent = ''
}

const getDevices = function() {
    const http = self.ctx.http;

    // Load multiple devices
    const deviceQuery = http.get(
        '/api/tenant/devices?pageSize=100&page=0');

    deviceQuery.forEach((devices) => {
        devices.data.forEach((device) => {
            const deviceName = String(
                    device.name),
                deviceId = String(device
                    .id.id)

            var option = document
                .createElement(
                    "option");
            option.value = deviceId;
            option.innerHTML =
                deviceName;
            select.appendChild(option);
        });
    });
}

const formatJsonData = function(valueString) {
    return valueString.replace(/"/g, '').replace(/{/g,
        '').replace(/}/g, '').split(',')
}