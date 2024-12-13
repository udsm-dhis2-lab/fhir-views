# HDU API DATA AGGREGATION

## HDU API VIEWS (FLATTERNING FHIR RESOURCES DATA)

### VIEWS Folder

- Defines the selected FHIR resources from Ministry of Health (MoH) Tanzania FHIR Implementation Guide i.e MoHTanzania-IG

### Data Extraction Queries

- Dynamically generated using the `create-queries.js` that use mappings.
- Mappings have been created using interface where user is presented with data fields from DHIS2 aggregate tools plus other important parameters like `Gender`, `Age group`, `Age type`, `ICD codes` and `LOINC codes`
- Date for aggregating the data have been chosen with respect to kind of data or how the respective data for producing aggregate are produced. Take an example of `Encounter` period and `DiagnosticReport` effective datetime
