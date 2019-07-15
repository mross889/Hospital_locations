require([
  "esri/Map",
  "esri/views/MapView",
  "esri/layers/GraphicsLayer",
  "esri/tasks/QueryTask",
  "esri/tasks/support/Query",
  "esri/symbols/SimpleMarkerSymbol"
  
], function(Map, MapView, GraphicsLayer, QueryTask, Query,SimpleMarkerSymbol) {
  
  // URL to feature service containing Global Hospital Locations
  var hospUrl =
    "https://services.arcgis.com/o6oETlrWetREI1A2/ArcGIS/rest/services/Hospital_LL/FeatureServer/0";

  // Define the popup content for each result
  var popupTemplate = {
// autocasts as new PopupTemplate()
title: "{Hospital}, {City_Town}",
fieldInfos: [
{
  fieldName: "Hosp_beds",
  label: "Bed Count",
  format: {
    places: 0,
    digitSeperator: true
  }
},
{
  fieldName: "Occupency",
  label: "Beds Occupied",  
  format: {
    places: 0,
    digitSeperator: true
  }
},],
};

var hospSymbol = {
type: "simple-marker", // autocasts as new 2D Point
symbolLayers: [
{
  type: "point", // autocasts as new point symbol
  resource: {
    primitive: "point"
  }
}
],
};

  // Create graphics layer and symbol to use for displaying the results of query
  //THIS WILL BE DISPLAYED INSIDE THE CIRCLE.
  var resultsLayer = new GraphicsLayer();


  // Point QueryTask to URL of feature service
   
  var qTask = new QueryTask({
    url: hospUrl
  });

  
  var params = new Query({
    returnGeometry: true,
    outFields: ["*"]
  });

  const map = new Map({
    basemap: "hybrid",
    layers: [resultsLayer] // add graphics layer to the map
  });

  var view = new MapView({
    map: map,
    container: "viewDiv1",
    center: [-100, 38],
    zoom: 4,
    popup: {
      dockEnabled: true,
      dockOptions: {
        position: "top-right",
        breakpoint: false
      }
    }
  });

  // Call doQuery() each time the button is clicked
  view.when(function() {
    view.Accpane3.add("optionsDiv1");
    document.getElementById("doBtn").addEventListener("click", doQuery);
  });

  var attributeName = document.getElementById("attSelect");
  var expressionSign = document.getElementById("signSelect");
  var value = document.getElementById("valSelect");

  // Executes each time the button is clicked
  function doQuery() {
    // Clear the results from a previous query
    resultsLayer.removeAll();
    
    params.where =
      attributeName.value + expressionSign.value + value.value;

    // executes the query and calls getResults() once the promise is resolved
    // promiseRejected() is called if the promise is rejected
    qTask
      .execute(params)
      .then(getResults)
      .catch(promiseRejected);
  }

  // Called each time the promise is resolved
  function getResults(response) {
    // Loop through each of the results and assign a symbol and PopupTemplate
    // to each so they may be visualized on the map
    var hospResults = response.features.map(function(feature) {
    
      feature.symbol = {
type: "simple-marker",
style: "circle",
color: "blue",
size: "8px",  // pixels
outline: {
color: [124, 11, 11],
width: 2  // points
}
};
      feature.popupTemplate = popupTemplate;
      return feature;
    });

    resultsLayer.addMany(hospResults);

    // animate to the results after they are added to the map
   view.goTo(hospResults).then(function() {
      view.popup.open({
        features: hospResults,
        featureMenuOpen: true,
        updateLocationEnabled: true
      });
    });

    // print the number of results returned to the user
    document.getElementById("printResults").innerHTML =
      hospResults.length + " results found!";
  }

  // Called each time the promise is rejected
  function promiseRejected(error) {
    console.error("Promise rejected: ", error.message);
  }
});
