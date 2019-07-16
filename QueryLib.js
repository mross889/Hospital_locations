define([], function() {
  /////////////////////////////////////////////////////////////////////////////
  //
  // Private members
  //
  /////////////////////////////////////////////////////////////////////////////

  // Set up statistics definition for client-side query
  // Total popultion of age groups by gender in census tracts
  const statDefinitions = ["Hosp_beds", "Occupency"].map(function(fieldName) {
    return {
      onStatisticField: fieldName,
      outStatisticFieldName: fieldName + "_TOTAL",
      statisticType: "sum"
    };
  });

  /////////////////////////////////////////////////////////////////////////////
  //
  // Public (exported) members
  //
  /////////////////////////////////////////////////////////////////////////////

  return {
    //Spatial query for hospital feature layer view for statistics
    queryLayerViewAgeStats(featureLayerView, buffer) {
      // Data storage for the chart
      let Hosp_beds = [], Occupency = [];

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
  };
});
