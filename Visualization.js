var Visualization = {
	jsonDataFromServer: [],
	jsonDataWithMetadata: [],
	jsonData: [],
	dataColumns: [],
	dataTypes: [],
	mainDataTypes: [],
	itemCount: 0,
	
	constants: {
		chartTypes: ["area", "bar", "columnSimple", "donut", "geo", "histogram", "line", "lineSimple", "lineSimpleWithoutCurve", "lineWithoutCurve", "pie", "scatter"],
		chartTypesMultiColumnOnly: ["area", "bar", "columnSimple", "donut", "geo", "line", "lineWithoutCurve", "pie", "scatter"],
		dataTypes: ["string", "int", "float", "boolean", "date", "time", "url"],
		graphTypes: ["table", "area", "bar", "column", "line", "dual", "pie", "stacked", "histogram", "scatter", "value"],
		minDifferenceForLogarithmicChart: 1000,
		maxNumberOfRowsToAnalyze: 100
	},
	
	// ========== Set data ==========
	
	setData: function(inputData) {
		// Check data:
		if (!inputData) {
			this.resetData();
			return;
		}
		if (!Array.isArray(inputData) && typeof inputData === "object") {
			if (!inputData.result) {
				inputData = [inputData];
			}
		}
		// Process data:
		this.jsonDataFromServer = inputData;
		if (!inputData.result) {
			this._setPureJsonData(inputData);
			return;
		}
		var processedData = [];
		this.jsonDataWithMetadata = inputData.result.result.sparql.results[0].result;
		var resultData = this.jsonDataWithMetadata;
		for (var i = 0; i < resultData.length; i++) {
			processedData.push(this.getJsonObjectFromServerResponse(resultData[i]));
		}
		if (!Array.isArray(processedData)) {
			processedData = [];
		}
		this.jsonData = processedData;
		// Get other information:
		this.dataColumns = this.jsonDataFromServer.result.result.sparql.head[0].variable.map(function(obj) {return obj.$.name;});
		this.dataTypes = this._getDataTypesFromMetadata();
		this.mainDataTypes = this.dataTypes.map(function(type) {return this.getMainDataType(type);}.bind(this));
		this.itemCount = this.getDataLength(this.jsonData);
		this._postProcessInputDataToAdjustTypes(this.jsonData);
		this._postProcessInputDataForVisualization(this.jsonData);
		this.defaultChartType = this._findDefaultAutoChartType();
	},
	
	_setPureJsonData: function(inputData) {
		this.jsonDataWithMetadata = inputData;
		this.jsonData = inputData;
		this.dataColumns = inputData.length ? Object.keys(inputData[0]) : [];
		this.dataTypes = this._getDataTypesFromData(inputData);
		this.mainDataTypes = this._getDataTypesFromData(inputData);
		this.itemCount = this.getDataLength(this.jsonData);
		this._postProcessInputDataToAdjustTypes(this.jsonData);
		this._postProcessInputDataForVisualization(this.jsonData);
		this.defaultChartType = this._findDefaultAutoChartType();
	},
	
	_getDataTypesFromMetadata: function() {
		var dataTypes = [];
		this.jsonDataWithMetadata[0].binding.map(function(entry){ // will only try to guess data type by checking the first entry
			if (entry.literal[0].$ === undefined) {
				return this._getDataTypeFromVariable(entry.literal[0]);
			} else {
				return entry.literal[0].$.datatype.split("#")[1];
			}
		}.bind(this));
		return dataTypes;
	},
	
	_getDataTypesFromData: function(inputData) {
		var i = 0;
		var maxRowsToAnalyze = this.constants.maxNumberOfRowsToAnalyze;
		if (inputData.length < maxRowsToAnalyze) {
			maxRowsToAnalyze = inputData.length;
		}
		var allDataTypes = [];
		for (i = 0; i < maxRowsToAnalyze; i++) {
			allDataTypes.push(this._getDataTypesForInputObject(inputData[i]));
		}
		var dataTypesForEachColumn = [];
		var currentDatatypes = [];
		if (!allDataTypes.length) {
			return [];
		}
		for (i = 0; i < allDataTypes[0].length; i++) {
			currentDatatypes = allDataTypes.map(function(obj) {return obj[i];});
			currentDatatypes = currentDatatypes.filter(function (x, i, a) {return a.indexOf(x) == i;});
			dataTypesForEachColumn.push(currentDatatypes);
		}
		var columnDataTypes = [];
		for (i = 0; i < dataTypesForEachColumn.length; i++) {
			columnDataTypes.push(this._getDataTypeFromTypesArray(dataTypesForEachColumn[i]));
		}
		return columnDataTypes;
	},
	
	_getDataTypesForInputObject: function(inputObj) {
		var values = Object.values(inputObj);
		var result = [];
		values.forEach(function(value) {
			result.push(this._getDataTypeFromVariable(value));
		}.bind(this));
		return result;
	},
	
	_getDataTypeFromVariable: function(input) {
		if (input === true || input === false) {
			return "boolean";
		}
		if (input === "" || input === " ") {
			return "string";
		}
		if (typeof input !== "string") {
			input = input.toString();
		}
		var nan = isNaN(Number(input));
		var isfloat = /^\d*(\.|,)\d*$/;
		var commaFloat = /^(\d{0,3}(,)?)+\.\d*$/;
		var dotFloat = /^(\d{0,3}(\.)?)+,\d*$/;
		var date = /^\d{0,4}(\.|\/)\d{0,4}(\.|\/)\d{0,4}$/;
		if (!nan){
			if (parseFloat(input) === parseInt(input)) {
				return "int";
			} else {
				return "float";
			}
		}
		if (isfloat.test(input) || commaFloat.test(input) || dotFloat.test(input)) {
			return "float";
		}
		if (date.test(input)) {
			return "date";
		}
		return "string";
	},
	
	_getDataTypeFromTypesArray: function(dataTypes) {
		if (dataTypes.length === 1) {
			return dataTypes[0];
		}
		if (!dataTypes.length) {
			return "string";
		}
		if (dataTypes.indexOf("int" > -1 && dataTypes.indexOf("float") > -1)) {
			return "float";
		}
		return dataTypes[0];
	},
	
	_postProcessInputDataForVisualization: function() {
		var columns = this.getDataColumns();
		var dataTypes = this.getMainDataTypes();
		if (columns.length === 2) {
			if (dataTypes.indexOf("string") > 0 && dataTypes[0] !== "string") {
				this._swapColumns(this.jsonData);
			}
		}
	},
	
	_postProcessInputDataToAdjustTypes: function() {
		var columns = this.getDataColumns();
		var dataTypes = this.getMainDataTypes();
		for (var i = 0; i < dataTypes.length; i++) {
			if (dataTypes[i] === "int") {
				this.jsonData.map(function(obj) {obj[columns[i]] = parseInt(obj[columns[i]], 10);});
			}
			if (dataTypes[i] === "float") {
				this.jsonData.map(function(obj) {obj[columns[i]] = parseFloat(obj[columns[i]], 10);});
			}
		}
	},
	
	_swapColumns: function(inputData) {
		if (!inputData && !inputData.length) {
			return inputData;
		}
		var columns = Object.keys(inputData[0]);
		var outputData = [];
		for (var i = 0; i < inputData.length; i++) {
			outputData.push(JSON.parse('{"' + columns[1] + '":"' + inputData[i][columns[1]] + '","' + columns[0] + '":' + inputData[i][columns[0]] + "}"));
		}
		this.jsonData = outputData;
	},
	
	resetData: function() {
		this.jsonDataFromServer = [];
		this.jsonData = [];
	},
	
	getJsonDataFromServer: function() {
		return this.jsonDataFromServer;
	},
	
	getData: function() {
		return this.jsonData;
	},
	
	getDataColumns: function() {
		return this.dataColumns;
	},
	
	getDataTypes: function() {
		return this.dataTypes;
	},
	
	getMainDataTypes: function() {
		return this.mainDataTypes;
	},
	
	getDefaultChartType: function() {
		return this.defaultChartType;
	},
	
	getJsonObjectFromServerResponse: function(inputObj) {
		var outputObj = {};
		for (var i = 0; i < inputObj.binding.length; i++) {
			if (inputObj.binding[i].literal[0]._ === undefined) {
				outputObj[inputObj.binding[i].$.name] = inputObj.binding[i].literal[0];
			} else {
				outputObj[inputObj.binding[i].$.name] = inputObj.binding[i].literal[0]._;
			}
		}
		return outputObj;
	},

	getDataLength: function(aData) {
		if (Array.isArray(aData)) {
			return aData.length;
		} else {
			return 0;
		}
	},

	getUniqueColumnNames: function(aData) {
		return Object.keys(aData[0]);
	},

	getValuesByColumnName: function(oData, sColumnName) {
		var aValues = [];
		oData.forEach(function(oObject) {
			aValues.push(oObject[sColumnName]);
		});
	},

	getValueDataTypeFromValue: function(value) {
		if (typeof value === "string" || typeof value === "boolean") {
			return typeof value;
		}
		if (typeof value === "number") {
			if (Number(value) === value && value % 1 === 0) {
				return "int";
			} else if (Number(value) === value && value % 1 !== 0){
				return "float";
			}
		}
		return "string";
	},

	getMainDataType: function(sDataType) {
		sDataType = sDataType.toLowerCase();
		var aStringDataTypes = ["entities", "entity", "id", "idref", "idrefs", "language", "name", "ncname", "nmtoken", "nmtokens", "normalizedstring", "qname", "string", "token"];
		if (aStringDataTypes.indexOf(sDataType) > -1) {
			return "string";
		}
		if (sDataType === "date" || sDataType === "datetime") {
			return "date";
		}
		var aTimeDataTypes = ["duration", "gday", "gmonth", "gmonthday", "gyear", "gyearmonth", "time"];
		if (aTimeDataTypes.indexOf(sDataType) > -1) {
			return "time";
		}
		var aIntDataTypes = ["byte", "int", "integer", "long", "negativeinteger", "nonnegativeinteger", "nonpositiveinteger", "positiveinteger", "short", "unsignedlong", "unsignedint", "unsignedshort", "unsignedbyte"];
		if (aIntDataTypes.indexOf(sDataType) > -1) {
			return "int";
		}
		if (sDataType === "decimal" || sDataType === "double" || sDataType === "float") {
			return "float";
		}
		if (sDataType === "boolean") {
			return "boolean";
		}
		if (sDataType === "anyuri") {
			return "url";
		}
		
		return "string";
	},
	
	// ========== Draw auto chart ==========
	
	drawAutoChart: function() {
		this.drawChartByType(this.defaultChartType, this.getData(), this._findDefaultOptionsForChartType(this.defaultChartType));
	},
	
	_findDefaultAutoChartType: function() {
		var jsonData = this.getData();
		var columns = this.getDataColumns();
		var dataTypes = this.getMainDataTypes();
		if (!columns.length) {
			return "lineSimpleWithoutCurve";
		}
		if (columns.length === 1) {
			return "histogram";
		}
		if (columns.length === 2) {
			if (dataTypes.indexOf("string") > -1 && (dataTypes.indexOf("int") > -1 || dataTypes.indexOf("float") > -1)) { // one column is string, another is numeric
				return (jsonData.length === 1) ? "scatter" : "columnSimple";
			}
			if ((dataTypes[0] === "int" || dataTypes[0] === "float") && (dataTypes[1] === "int" || dataTypes[1] === "float")) { // both columns are numeric
				return "lineWithoutCurve";
			}
		}
		return "lineWithoutCurve";
	},
	
	_findDefaultOptionsForChartType: function(chartType) {
		var chartOptions = {title: "Chart"};
		var columns = this.getDataColumns();
		var dataTypes = this.getMainDataTypes();
		if (columns.length === 2 && (chartType === "area" || chartType === "bar" || chartType === "columnSimple" || chartType === "line" || chartType === "lineWithoutCurve" || chartType === "scatter")) {
			chartOptions.hAxis = {title: columns[0]}; // X axis title, e.g. "Year"
			chartOptions.title = columns[1] + " by " + columns[0]; // Chart title, e.g. "Sales by Year"
		}
		if (columns.length === 2 && (chartType === "pie" || chartType === "donut")) {
			chartOptions.title = columns[1] + " by " + columns[0];
		}
		if (chartType === "donut") {
			chartOptions.pieHole = 0.4;
		}
		if (chartType === "area" || chartType === "columnSimple" || chartType === "line" || chartType === "lineWithoutCurve") {
			if (!chartOptions.vAxis) {
				chartOptions.vAxis = {};
			}
			chartOptions.vAxis.minValue = 0;
		}
		if (chartType === "line" || chartType === "lineSimple") {
			chartOptions.curveType = "function";
		}
		// Logarithmic scale cases:
		if (columns.length === 2) {
			if (dataTypes[0] === "int" || dataTypes[0] === "float") { // For horizontal axis
				if (this._getMinMaxDifferenceForColumn(this.getData(), columns[0]) > this.constants.minDifferenceForLogarithmicChart) {
					if (!chartOptions.hAxis) {
						chartOptions.hAxis = {};
					}
					chartOptions.hAxis.scaleType = "log";
				}
			}
			if (dataTypes[1] === "int" || dataTypes[1] === "float") { // For vertical axis
				if (this._getMinMaxDifferenceForColumn(this.getData(), columns[1]) > this.constants.minDifferenceForLogarithmicChart) {
					if (!chartOptions.vAxis) {
						chartOptions.vAxis = {};
					}
					chartOptions.vAxis.scaleType = "log";
				}
			}
		}
		return chartOptions;
	},
	
	drawChartByType: function(chartType, inputDataForChart, options) {
		switch(chartType) {
			case "area": this.drawAreaChart(inputDataForChart, options);
				break;
			case "bar": this.drawBarChart(inputDataForChart, options);
				break;
			case "columnSimple": this.drawSimpleColumnChart(inputDataForChart, options);
				break;
			case "donut": this.drawPieChart(inputDataForChart, options);
				break;
			case "geo": this.drawGeoChart(inputDataForChart, options);
				break;
			case "histogram": this.drawHistogram(inputDataForChart, options);
				break;
			case "line": this.drawLineChart(inputDataForChart, options);
				break;
			case "lineSimple": this.drawSimpleLineChart(inputDataForChart, options);
				break;
			case "lineSimpleWithoutCurve": this.drawSimpleLineChart(inputDataForChart, options);
				break;
			case "lineWithoutCurve": this.drawLineChart(inputDataForChart, options);
				break;
			case "pie": this.drawPieChart(inputDataForChart, options);
				break;
			case "scatter": this.drawScatterChart(inputDataForChart, options);
				break;
		}
	},
	
	// ========== Draw specific chart ==========

	_prepareDataForMultiColumnCharts: function(inputData, isPieChart) {
		var outputData = [];
		if (!inputData || !inputData.length) {
			return [];
		}
		var columns = Object.keys(inputData[0]);
		if (!isPieChart) {
			outputData.push(columns);
		}
		for (var i = 0; i < inputData.length; i++) {
			outputData.push(Object.values(inputData[i]));
		}
		return outputData;
	},
	
	drawAreaChart: function(inputData, options) {
        var data = google.visualization.arrayToDataTable(this._prepareDataForMultiColumnCharts(inputData));
		var chart = new google.visualization.AreaChart(document.getElementById('chart_div'));
        chart.draw(data, options);
	},
	
	drawBarChart: function(inputData, options) {
		var data = google.visualization.arrayToDataTable(this._prepareDataForMultiColumnCharts(inputData));
		var chart = new google.visualization.BarChart(document.getElementById('chart_div'));
		chart.draw(data, options);
	},
	
	drawGeoChart: function(inputData, options) {
		var data = google.visualization.arrayToDataTable(this._prepareDataForMultiColumnCharts(inputData));
		var chart = new google.visualization.GeoChart(document.getElementById('chart_div'));
		chart.draw(data, options);
	},
	
	drawHistogram: function(inputData, options) {
		var data = google.visualization.arrayToDataTable(this._prepareDataForMultiColumnCharts(inputData));
		var chart = new google.visualization.Histogram(document.getElementById('chart_div'));
		chart.draw(data, options);
	},
	
	drawSimpleLineChart: function(inputData, options) {
		var arrChartData = [['', '']];
		var columns = this.getDataColumns();
		var dataTypes = this.getMainDataTypes();
		var mainColumnNr = 0;
		if (columns.length) {
			if (dataTypes.indexOf("int") > -1) {
				mainColumnNr = dataTypes.indexOf("int");
			}
			if (dataTypes.indexOf("float") > -1) {
				mainColumnNr = dataTypes.indexOf("float");
			}
			for (var i = 0; i < inputData.length; i++) {
				arrChartData.push([(i + 1).toString(), inputData[i][columns[mainColumnNr]]]);
			}
		} else {
			for (var i = 0; i < inputData.length; i++) {
				arrChartData.push([(i + 1).toString(), inputData[i]]);
			}
		}
		var data = google.visualization.arrayToDataTable(arrChartData);
		var chart = new google.visualization.LineChart(document.getElementById('chart_div'));
		chart.draw(data, options);
	},
	
	drawLineChart: function(inputData, options) {
		var data = google.visualization.arrayToDataTable(this._prepareDataForMultiColumnCharts(inputData));
		var chart = new google.visualization.LineChart(document.getElementById('chart_div'));
		chart.draw(data, options);
	},
	
	drawPieChart: function(inputData, options) {
		var inputColumns = [];
		var i = 0;
		var columnNames = this.getDataColumns();
		var columnDataTypes = this.getMainDataTypes();
		var currentDataType = "";
		for (i = 0; i < columnNames.length; i++) {
			currentDataType = columnDataTypes[i];
			currentDataType = (currentDataType === "int" || currentDataType === "float") ? "number" : "string";
			inputColumns.push({name: columnNames[i], type: currentDataType});
		}
		
		var data = new google.visualization.DataTable();
		for (i = 0; i < inputColumns.length; i++) {
			data.addColumn(inputColumns[i].type, inputColumns[i].name);
		}
		data.addRows(this._prepareDataForMultiColumnCharts(inputData, true));
		var chart = new google.visualization.PieChart(document.getElementById('chart_div'));
		chart.draw(data, options);
	},
	
	drawScatterChart: function (inputData, options) {
		var data = google.visualization.arrayToDataTable(this._prepareDataForMultiColumnCharts(inputData));
		var chart = new google.visualization.ScatterChart(document.getElementById('chart_div'));
		chart.draw(data, options);
	},
	
	drawSimpleColumnChart: function(inputData, options) {
		var data = google.visualization.arrayToDataTable(this._prepareDataForMultiColumnCharts(inputData));
		var chart = new google.visualization.ColumnChart(document.getElementById('chart_div'));
		chart.draw(data, options);
	},
	
	// ========== Various functions ==========
	
	pickPropertiesFromJson: function(json, properties) {
		if (Array.isArray(json)) {
			var resultJson = [];
			for (var i = 0; i < json.length; i++) {
				var tempObj = {};
				for (var j = 0; j < properties.length; j++) {
					tempObj[properties[j]] = json[i][properties[j]];
				}
				resultJson.push(tempObj);
			}
			return resultJson;
		}
		if (typeof json === "object") {
			var resultObj = {};
			for (var j = 0; j < properties.length; j++) {
				resultObj[properties[j]] = json[properties[j]];
			}
			return resultObj;
		}
		return json;
	},
	
	_getMinMaxDifferenceForColumn: function(inputData, columnName) {
		var minValue = Math.min.apply(Math, inputData.map(function(obj) { return obj[columnName]; }));
		var maxValue = Math.max.apply(Math, inputData.map(function(obj) { return obj[columnName]; }));
		if (minValue === 0 || (minValue < 0.00001 && minValue > -0.00001)) {
			return 0;
		}
		var difference = maxValue / minValue;
		if (difference === Infinity) {
			return 0;
		}
		if (difference < 0) {
			difference *= -1;
		}
		return difference;
	},
	
	_objectHasNull(object) {
		for (var property in object) {
			if (object[property] == null) {
				return true;
			}
		}
		return false;
	},
	
	// ========== Export image ==========
	
	convertSvgToB64Image: function(){
		var svg = document.querySelector('svg');
		var xml = new XMLSerializer().serializeToString(svg);
		var svg64 = btoa(xml); //for utf8: btoa(unescape(encodeURIComponent(xml)))
		var b64start = 'data:image/svg+xml;base64,';
		var image64 = b64start + svg64;
		return image64;
	},

	exportPNG: function (chartElement) {
		var svg = chartElement ? chartElement : document.querySelector("svg");
		var svgData = new XMLSerializer().serializeToString(svg);
		var canvas = document.createElement("canvas");
		canvas.width = svg.clientWidth;
		canvas.height = svg.clientHeight;
		var ctx = canvas.getContext("2d");
		var dataUri = '';
		try {
			dataUri = 'data:image/svg+xml;base64,' + btoa(svgData);
		} catch (ex) {

		}
		var img = document.createElement("img");
		img.onload = function () {
			ctx.drawImage(img, 0, 0);
			try {
				var a = document.createElement("a");
				a.download = "Chart.png";
				a.href = canvas.toDataURL("image/png");
				document.querySelector("body").appendChild(a);
				a.click();
				document.querySelector("body").removeChild(a);
			} catch (ex) {
				var imgPreview = document.createElement("div");
				imgPreview.appendChild(img);
				document.querySelector("body").appendChild(imgPreview);
			}
		};
		img.src = dataUri;
	},
	
	exportSVG: function() {
		var event = new MouseEvent('click', {
		'view': window,
		'bubbles': true,
		'cancelable': true
		});
		var url = this.convertSvgToB64Image();
		var a = document.createElement('a');
		a.setAttribute('download', 'Chart.svg');
		a.setAttribute('href', url);
		a.setAttribute('target', '_blank');
		a.dispatchEvent(event);
	}
};