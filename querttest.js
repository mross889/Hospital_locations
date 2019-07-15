require([
  "esri/widgets/Sketch/SketchViewModel",
  "esri/geometry/Polyline",
  "esri/geometry/Point",
  "esri/Graphic",
  "esri/Map",
  "esri/views/MapView",
  "esri/layers/FeatureLayer",
  "esri/layers/GraphicsLayer",
  "esri/geometry/geometryEngine",
  "esri/widgets/Expand",
  "esri/widgets/Legend",
  "esri/widgets/Search",
  "esri/widgets/Compass",
  "esri/widgets/BasemapToggle",
  "esri/tasks/QueryTask",
  "esri/tasks/support/Query",
  "esri/symbols/SimpleMarkerSymbol",
  "esri/core/watchUtils"
], function(
  SketchViewModel,
  Polyline,
  Point,
  Graphic,
  Map,
  MapView,
  FeatureLayer,
  GraphicsLayer,
  geometryEngine,
  Expand,
  Legend,
  Search,
  Compass,
  BasemapToggle,
  QueryTask,
  Query,
  SimpleMarkerSymbol,
  watchUtils
) {
  // App 'globals'
  let sketchViewModel, featureLayerView, pausableWatchHandle, chartExpand;

  let centerGraphic,
    edgeGraphic,
    polylineGraphic,
    bufferGraphic,
    centerGeometryAtStart,
    labelGraphic;

  const unit = "miles";

  // Create layers
  const graphicsLayer = new GraphicsLayer();
  const graphicsLayer2 = new GraphicsLayer();

  var featureLayer = new FeatureLayer({
    url:
      "https://services.arcgis.com/o6oETlrWetREI1A2/arcgis/rest/services/Hospital_LL/FeatureServer",

    outFields: ["*"]
  });

  // Create map
  const map = new Map({
    basemap: "hybrid",
    layers: [featureLayer, graphicsLayer2, graphicsLayer]
  });

  // Create view
  var view = new MapView({
    container: "viewDiv",
    map: map,
    scale: 70580000,
    center: [-19.535569, 3.005652],
    constraints: {
      maxScale: 0,
      minScale: 77580000
    }
  });

  // Set up statistics definition for client-side query
  // Total popultion of age groups by gender in census tracts
  const statDefinitions = ["Hosp_beds", "Occupency"].map(function(fieldName) {
    return {
      onStatisticField: fieldName,
      outStatisticFieldName: fieldName + "_TOTAL",
      statisticType: "sum"
    };
  });

  // Update UI
  setUpAppUI();
  setUpSketch();

  function setUpAppUI() {
    // When layer is loaded, create a watcher to trigger drawing of the buffer polygon
    view.whenLayerView(featureLayer).then(function(layerView) {
      featureLayerView = layerView;

      pausableWatchHandle = watchUtils.pausable(layerView, "updating", function(
        val
      ) {
        if (!val) {
          drawBufferPolygon();
        }
      });

      // Display directions when the layerView is loading
      watchUtils.whenFalseOnce(layerView, "updating", function() {
        view.popup.open({
          title: "Global Hospital Information",
          content:
            "Drag this point to move the buffer.<br/> " +
            "Or drag the <b>Edge</b> point to resize the buffer.</br>" +
            "Your result will show under the spatial query tab",

          location: centerGraphic.geometry
        });
        view.popup.alignment = "top-left";
      });
    });

    view.when(function() {
      // Display the chart in an Expand widget
      chartExpand = new Expand({
        expandIconClass: "esri-icon-chart",
        expandTooltip: "Hospital Information chart",
        expanded: false,
        view: Accpane2,
        content: document.getElementById("chartPanel")
      });

      const search = new Search({
        view: view,
        resultGraphicEnabled: false,
        popupEnabled: false
      });

      // Resume drawBufferPolygon() function; user searched for a new location
      // Must update the buffer polygon and re-run the stats query
      search.on("search-complete", function() {
        pausableWatchHandle.resume();
      });

      // Legend widget
      const legend = new Legend({
        view: view,
        layerInfos: [
          {
            layer: featureLayer,
            title: "Hospitals"
          }
        ]
      });

      // Display the Legend in an Expand widget
      const legendExpand = new Expand({
        expandTooltip: "Show Legend",
        expanded: false,
        view: Accpane2,
        content: legend
      });

      var compassWidget = new Compass({
        view: view
      });

      var toggle = new BasemapToggle({
        view: view,
        nextBasemap: "topo"
      });

      // Add our components to the UI
      //view.ui.add(chartExpand, "bottom-left");
      view.ui.add(search, "top-right");
      view.ui.add(compassWidget, "top-left");
      view.ui.add(toggle, "bottom-right");
      view.ui.add(legendExpand, "bottom-right");
    });

    // Close the 'help' popup when view is focused
    view.watch("focused", function(newValue) {
      if (newValue) {
        view.popup.close();
      }
    });
  }

  // Create SketchViewModel and wire up event listeners

  function setUpSketch() {
    sketchViewModel = new SketchViewModel({
      view: view,
      layer: graphicsLayer
    });

    // Listen to SketchViewModel's update event so that population pyramid chart

    sketchViewModel.on("update", onMove);
  }

  function onMove(event) {
    // If the edge graphic is moving, keep the center graphic
    // at its initial location. Only move edge graphic
    if (event.toolEventInfo && event.toolEventInfo.mover.attributes.edge) {
      const toolType = event.toolEventInfo.type;
      if (toolType === "move-start") {
        centerGeometryAtStart = centerGraphic.geometry;
      }
      // keep the center graphic at its initial location when edge point is moving
      else if (toolType === "move" || toolType === "move-stop") {
        centerGraphic.geometry = centerGeometryAtStart;
      }
    }

    // the center or edge graphic is being moved, recalculate the buffer
    const vertices = [
      [centerGraphic.geometry.x, centerGraphic.geometry.y],
      [edgeGraphic.geometry.x, edgeGraphic.geometry.y]
    ];

    // client-side stats query of features that intersect the buffer
    calculateBuffer(vertices);

    // user is clicking on the view... call update method with the center and edge graphics
    if (event.state === "cancel" || event.state === "complete") {
      sketchViewModel.update([edgeGraphic, centerGraphic], {
        tool: "move"
      });
    }
  }

  /* Edge or center point is being updated. Recalculate the buffer with
    updated geometry information.*/

  function calculateBuffer(vertices) {
    // Update the geometry of the polyline based on location of edge and center points
    polylineGraphic.geometry = new Polyline({
      paths: vertices,
      spatialReference: view.spatialReference
    });

    // Recalculate the polyline length and buffer polygon
    const length = geometryEngine.geodesicLength(
      polylineGraphic.geometry,
      unit
    );
    const buffer = geometryEngine.geodesicBuffer(
      centerGraphic.geometry,
      length,
      unit
    );

    // Update the buffer polygon
    bufferGraphic.geometry = buffer;

    // Query total beds and beds occupied
    queryLayerViewAgeStats(buffer).then(function(newData) {
      // Create a chart from the returned result
      updateChart(newData);
    });

    // Update label graphic to show the length of the polyline on circle
    labelGraphic.geometry = edgeGraphic.geometry;
    labelGraphic.symbol = {
      type: "text",
      color: "#FFEB00",
      text: length.toFixed(2) + " miles",
      xoffset: 50,
      yoffset: 10,
      font: {
        // autocast as Font
        size: 14,
        family: "sans-serif"
      }
    };
  }

  //Spatial query for hospital feature layer view for statistics
  function queryLayerViewAgeStats(buffer) {
    // Data storage for the chart
    let Hosp_beds = [],
      Occupency = [];

    // Client-side spatial query:
    // Get the total bed count and beds occupied for the hospitals
    const query = featureLayerView.layer.createQuery();
    query.outStatistics = statDefinitions;
    query.geometry = buffer;

    // Query the features on the client using FeatureLayerView.queryFeatures
    return featureLayerView
      .queryFeatures(query)
      .then(function(results) {
        // Statistics query returns a feature with 'stats' as attributes
        const attributes = results.features[0].attributes;
        // Loop through attributes and save the values for use in the chart.
        for (var key in attributes) {
          if (key.includes("Hosp")) {
            Hosp_beds.push(attributes[key]);
          } else {
            Occupency.push(-Math.abs(attributes[key]));
          }
        }

        return [Hosp_beds, Occupency];
      })
      .catch(function(error) {
        console.log(error);
      });
  }

  // Draw the buffer polygon when application loads or when user searches for a new location

  function drawBufferPolygon() {
    // When pause() is called on the watch handle, the callback represented by the
    // watch is no longer invoked, but is still available for later use
    // this watch handle will be resumed when user searches for a new location
    pausableWatchHandle.pause();

    // Initial location for the center, edge and polylines on the view
    const viewCenter = view.center.clone();
    const centerScreenPoint = view.toScreen(viewCenter);
    const centerPoint = view.toMap({
      x: centerScreenPoint.x + 80,
      y: centerScreenPoint.y - 80
    });
    const edgePoint = view.toMap({
      x: centerScreenPoint.x + 150,
      y: centerScreenPoint.y - 100
    });

    // Store updated vertices
    const vertices = [
      [centerPoint.x, centerPoint.y],
      [edgePoint.x, edgePoint.y]
    ];

    // Create center, edge, polyline and buffer graphics for the first time
    if (!centerGraphic) {
      const polyline = new Polyline({
        paths: vertices,
        spatialReference: view.spatialReference
      });

      // get the length of the initial polyline and create buffer
      const length = geometryEngine.geodesicLength(polyline, unit);
      const buffer = geometryEngine.geodesicBuffer(centerPoint, length, unit);

      // Create the graphics representing the line and buffer
      const pointSymbol = {
        type: "simple-marker",
        style: "circle",
        size: 10,
        color: [117, 29, 29, 0.5]
      };
      centerGraphic = new Graphic({
        geometry: centerPoint,
        symbol: pointSymbol,
        attributes: {
          center: "center"
        }
      });

      edgeGraphic = new Graphic({
        geometry: edgePoint,
        symbol: pointSymbol,
        attributes: {
          edge: "edge"
        }
      });

      polylineGraphic = new Graphic({
        geometry: polyline,
        symbol: {
          type: "simple-line",
          color: [0, 0, 0, 1],
          width: 2.5
        }
      });

      bufferGraphic = new Graphic({
        geometry: buffer,
        symbol: {
          type: "simple-fill",
          color: [168, 20, 20, 0.3],
          outline: {
            color: "#4d0000",
            width: 2
          }
        }
      });
      labelGraphic = labelLength(edgePoint, length);

      // Add graphics to layer
      graphicsLayer.addMany([centerGraphic, edgeGraphic]);
      // once center and edge point graphics are added to the layer,
      // call sketch's update method pass in the graphics so that users
      // can just drag these graphics to adjust the buffer
      setTimeout(function() {
        sketchViewModel.update([edgeGraphic, centerGraphic], {
          tool: "move"
        });
      }, 1000);

      graphicsLayer2.addMany([bufferGraphic, polylineGraphic, labelGraphic]);
    }
    // Move the center and edge graphics to the new location returned from search
    else {
      centerGraphic.geometry = centerPoint;
      edgeGraphic.geometry = edgePoint;
    }

    // Query features that intersect the buffer
    calculateBuffer(vertices);
  }

  // Create a chart for the hospital that intersect the buffer polygon
  // Chart is created using the Chart.js library
  let chart;

  function updateChart(newData) {
    chartExpand.expanded = true;

    const Hosp_beds = newData[0];
    const Occupency = newData[1];

    if (!chart) {
      // Get the canvas element and render the chart in it
      const canvasElement = document.getElementById("chart");

      chart = new Chart(canvasElement.getContext("2d"), {
        type: "horizontalBar",
        data: {
          datasets: [
            {
              label: "Beds Occupied",
              backgroundColor: "#0080FF",
              borderColor: "#004C99",
              borderWidth: 0.5,
              data: Occupency
            },

            {
              label: "Total Beds",
              backgroundColor: "#B266FF",
              borderColor: "#7F00FF",
              borderWidth: 0.5,
              data: Hosp_beds
            }
          ]
        },
        options: {
          responsive: false,
          legend: {
            position: "bottom"
          },
          title: {
            display: true,
            text: "Global Hospital Information "
          },
          scales: {
            yAxes: [
              {
                categorySpacing: 10,
                barThickness: 40,
                stacked: true,
                scaleLabel: {
                  display: true,
                  labelString: "",
                  beginAtZero: true
                }
              }
            ],
            xAxes: [
              {
                ticks: {
                  callback: function(value) {
                    const val = Math.abs(parseInt(value));
                    return numberWithCommas(val);
                  }
                },
                scaleLabel: {
                  display: true,
                  labelString: "Total Amount"
                }
              }
            ]
          },
          tooltips: {
            callbacks: {
              label: function(tooltipItem, data) {
                return (
                  data.datasets[tooltipItem.datasetIndex].label +
                  ": " +
                  numberWithCommas(Math.abs(tooltipItem.xLabel))
                );
              }
            }
          }
        }
      });
    } else {
      chart.data.datasets[0].data = Hosp_beds;
      chart.data.datasets[1].data = Occupency;
      chart.update();
    }
  }

  // Helper function for formatting number labels with commas
  function numberWithCommas(value) {
    value = value || 0;
    return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  // Label polyline with its length
  function labelLength(geom, length) {
    return new Graphic({
      geometry: geom,
      symbol: {
        type: "text",
        color: "#FFEB00",
        text: length.toFixed(2) + " miles",
        xoffset: 50,
        yoffset: 10,
        font: {
          // autocast as Font
          size: 14,
          family: "sans-serif"
        }
      }
    });
  }
});
