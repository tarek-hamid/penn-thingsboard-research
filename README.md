# penn-thingsboard-research
This repository holds code that I've written for the ThingsBoard interface as part of my Masters research at the University of 
Pennsylvania. Each folder contains three files: a JavaScript file for data processing and dynamic front-end interface development,
and HTML/CSS files for styling of the widget. Functionality of each widget is detailed below:

#### **download-data-generate-report-widget**

This widget was developed to allow clinicians to download device data in a specified time range and also generate a report on SpO2 data (time above/below certain values)

  ##### Functionality: 
  * Populates widget with stored devices and datePicker jQuery UI for time-selection.
  * On download button click, grabs all device data and generates a csv file with the data displayed. 
  * On generate report button click, grabs SpO2 data through ThingsBoard backend API call and generates a report on the various SpO2 levels
    from the selected time-period. 
