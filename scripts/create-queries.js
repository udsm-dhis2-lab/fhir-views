const fs = require("fs");
const path = require("path");

// Function to parse .env file
function loadEnv(filePath) {
  const absolutePath = path.resolve(filePath);
  const envVars = {};

  // Read the file
  const fileContent = fs.readFileSync(absolutePath, "utf8");

  // Split lines and parse key-value pairs
  fileContent.split("\n").forEach((line) => {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith("#")) {
      // Ignore empty lines and comments
      const [key, value] = trimmedLine.split("=");
      envVars[key] = value.replace(/(^['"]|['"]$)/g, ""); // Remove quotes if present
    }
  });

  return envVars;
}

// Load the .env file
const env = loadEnv(".env");

// Use environment variables
const username = env.USERNAME;
const password = env.PASSWORD;
const baseUrl = env.BASE_URL;
const dataSetsReferences = env.DATASETS;

console.log(username, password, baseUrl);
async function fetchMappings(dataSetId) {
  try {
    const response = await fetch(
      baseUrl + `/api/v1/datastore/MAPPINGS-${dataSetId}?pageSize=100`,
      {
        method: "GET",
        headers: {
          Authorization: `Basic ` + btoa(username + ":" + password),
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch mappings: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    let mappings = data["results"];
    await processMappings(mappings);
  } catch (error) {
    console.error("Error fetching mappings:", error);
  }
}

const dataSets = dataSetsReferences.split(","); // Set on respective env variable with format V8bbSX0sFf2,Pw3c2BcqbQ5 i.e each dataset id seperated by comma

for (const dataSet of dataSets) {
  fetchMappings(dataSet);
}

const startDate = "2024-11-01";
const endDate = "2024-11-30:23:59:59";

async function processMappings(datastoreKeyData) {
  datastoreKeyData.forEach((datastoreKey) => {
    const mapping = datastoreKey?.value;
    if (mapping && mapping?.params) {
      const dataElementId = mapping.dataElement.id;
      let query = `SELECT en.organization_id,\n`;

      query += `  '${dataElementId}' AS "${dataElementId}",\n`;

      let hasGender = false;
      let hasAgeGroup = false;
      mapping.params.forEach((param, index) => {
        hasGender = param.gender ? true : false;
        const gender = param.gender;
        const co = param.co;
        const ageType = param.ageType;
        const startAge = param.startAge;
        const endAge = param.endAge;
        hasAgeGroup = ageType && startAge && endAge ? true : false;
        query +=
          ` COUNT(*) ` +
          (hasGender || hasAgeGroup
            ? ` FILTER ( WHERE ${
                hasGender
                  ? "pt.gender='" +
                    (gender === "M" ||
                    gender === "ME" ||
                    gender.toLowerCase() === "male"
                      ? "male"
                      : "female") +
                    "'"
                  : ""
              } ${hasGender && hasAgeGroup ? "AND" : ""} ${
                hasAgeGroup
                  ? "pt.birth_date >= (CURRENT_DATE - INTERVAL '" +
                    startAge +
                    (ageType.toLowerCase() === "years"
                      ? " YEAR "
                      : ageType.toLowerCase() === "months"
                      ? " MONTH "
                      : " DAY ") +
                    "')" +
                    " AND " +
                    "pt.birth_date <= (CURRENT_DATE - INTERVAL '" +
                    endAge +
                    (ageType.toLowerCase() === "years"
                      ? " YEAR "
                      : ageType.toLowerCase() === "months"
                      ? " MONTH "
                      : " DAY ") +
                    "')"
                  : ""
              })`
            : "");
        query += ` AS "${co}"${
          index < mapping.params.length - 1 ? "," : ""
        } \n`;
      });
      let icdCodes = [];
      let loincOrderCodes = [];
      let loincObsCodes = [];

      if (mapping.icdMappings && mapping.icdMappings.length > 0) {
        icdCodes = mapping.icdMappings.map((icdMapping, index) => {
          return icdMapping.code;
        });
      }

      if (mapping.loincMappings && mapping.loincMappings.length > 0) {
        loincOrderCodes = mapping.loincMappings.map((mappingItem, index) => {
          return mappingItem.code;
        });
      }

      if (mapping.loincObsMappings && mapping.loincObsMappings.length > 0) {
        loincObsCodes = mapping.loincObsMappings.map((mappingItem, index) => {
          return mappingItem.code;
        });
      }
      query += ` FROM encounter_flat en \n`;

      // Be careful when choosing right vs left join
      if (icdCodes && icdCodes.length > 0) {
        query += `RIGHT JOIN condition_flat cond ON en.id = cond.encounter_id \n`;
        query += `AND cond.code IN ('${icdCodes.join("','")}') \n`;
      }
      if (loincOrderCodes.length > 0) {
        query += `RIGHT JOIN diagnosticreport_flat drep ON en.id = drep.encounter_id \n`;
        query += `AND drep.code IN ('${loincOrderCodes.join("','")}') \n`;
      }

      if (mapping.queries && mapping.queries.length > 0) {
        mapping.queries.forEach((queryItem, index) => {
          const leftSide = queryItem.leftSideQuery?.value;
          const operator = queryItem.operator;
          const rightSide = queryItem.rightSideQuery?.value;

          if (leftSide && operator && rightSide !== undefined) {
            const leftField =
              leftSide.table && leftSide.code
                ? `${leftSide.table}.${leftSide.code}`
                : leftSide.code;

            let rightValue;
            if (queryItem.rightSideQuery.type === "tableField") {
              rightValue =
                rightSide.table && rightSide.code
                  ? `${rightSide.table}.${rightSide.code}`
                  : rightSide.code;
            } else if (queryItem.rightSideQuery.type === "primitiveValue") {
              if (typeof rightSide === "string") {
                rightValue = `'${rightSide}'`;
              } else if (typeof rightSide === "number") {
                rightValue = rightSide;
              } else if (typeof rightSide === "boolean") {
                rightValue = rightSide ? "TRUE" : "FALSE";
              }
            }

            if (leftField && operator && rightValue !== undefined) {
              query += `AND ${leftField} ${operator} ${rightValue} \n`;
            }
          }
        });
        if (loincObsCodes.length > 0) {
          query += ` RIGHT JOIN observation_flat obs ON obs.encounter_id = en.encounter_id \n`;
          query += `AND obs.val_concept_code IN ('${loincObsCodes.join(
            "','"
          )}') \n`;
        }

        query += `LEFT JOIN patient_flat pt ON pt.id = en.patient_id \n `;

        query +=
          loincOrderCodes.length > 0
            ? `AND drep.effective_datetime >='${startDate}' AND drep.effective_datetime <='${endDate}' \n`
            : `AND en.period_start >= '${startDate}' AND en.period_start <= '${endDate}' \n`;

        query += ` GROUP BY `;
        query += icdCodes && icdCodes.length > 0 ? `cond.code,` : "";
        query += hasGender ? `pt.gender,` : "";
        query += ` en.organization_id;`;
        console.log(query);
      }
    }
  });
}
