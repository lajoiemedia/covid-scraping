const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const { zonedTimeToUtc, utcToZonedTime, format } = require("date-fns-tz");
const arrondissements = require("./resources/arrondissements.json");
const hospitals = require("./resources/hospitals.json");
const lev = require("fast-levenshtein");
const minBy = require("lodash.minby");

const TIMEZONE = "America/Montreal";

const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, "");

const MONTHS = {
  janvier: "01",
  février: "02",
  mars: "03",
  avril: "04",
  mai: "05",
  juin: "06",
  juillet: "07",
  août: "08",
  septembre: "09",
  octobre: "10",
  novembre: "11",
  décembre: "12",
};

const parseFrenchDate = (str) => {
  let split = str.trim().split(" ");
  return `${split[2]}-${MONTHS[split[1].toLowerCase()]}-${split[0].padStart(
    2,
    "0"
  )}`;
};

(async function () {
  const situationDir = path.join(__dirname, "raw", "montreal-situation");
  const processedDir = path.join(__dirname, "processed", "montreal-situation");
  let files = fs
    .readdirSync(situationDir)
    .filter((d) => fs.statSync(path.join(situationDir, d)).isFile())
    .slice()
    .sort();
  let onlyLastFiles = files.filter(
    (d, i, arr) =>
      i === arr.length - 1 || d.split(" ")[0] !== arr[i + 1].split(" ")[0]
  );
  let data = onlyLastFiles.flatMap((name) => {
    let $ = cheerio.load(
      fs.readFileSync(path.join(situationDir, name), { encoding: "utf8" })
    );
    let table = $("table")
      .filter((i, el) => {
        let ths = $(el).find("th");
        return (
          ths &&
          ths.length > 0 &&
          ths.first().text().toLowerCase().trim().includes("arrondissement")
        );
      })
      .first();

    //console.log($(`p:contains("Source : Fichier V10 en date du")`).text());
    let date = zonedTimeToUtc(
      name.split(" ")[0] + " " + name.split(" ")[1].replace("h", ":"),
      TIMEZONE
    );
    const parseNum = (str) => {
      let pctmult = str.includes("%") ? 0.01 : 1;
      let parsedStr = str
        .replace(/,/g, ".")
        .replace(/[^0-9\-\.]/g, "")
        .trim();

      let numerized = +parsedStr;
      if (numerized === 0 || numerized) {
        numerized *= pctmult;
      } else {
        numerized = null;
      }
      return numerized;
    };

    const parseRow = (row) => {
      return {
        region: row[0].trim().replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, ""),
        series: [
          {
            date_est:
              name.split(" ")[0] + " " + name.split(" ")[1].replace("h", ":"),
            millis: date.getTime(),
            cas: parseNum(row[1]),
            cas_pct: parseNum(row[2]),
            taux: parseNum(row[3]),
            taux_imprecis: row[3].includes("*"),
            morts: row.length > 4 ? parseNum(row[4]) : null,
            taux_morts: row.length > 5 ? parseNum(row[5]) : null,
            taux_morts_imprecis: row.length > 5 ? row[5].includes("*") : null,
          },
        ],
      };
    };

    let tablerows = table.find("tr");
    let rowarr = Array.from(tablerows)
      .map((el) => Array.from($(el).find("td")).map((el) => $(el).text()))
      .filter((d) => d.length > 0);
    return rowarr.map((d) => parseRow(d));
  });

  let massagedData = data
    .map((d) => d.region)
    .filter((d, i, arr) => arr.indexOf(d) === i)
    .map((region) => {
      let isRegionRow =
        !region.toLowerCase().includes("total") &&
        !region.toLowerCase().includes("confirmer");
      let obj = {
        munid: null,
        codeid: null,
        type: null,
      };
      if (isRegionRow) {
        let closest = minBy(arrondissements, (d) =>
          lev.get(normalize(region), normalize(d.NOM))
        );
        obj.munid = closest.MUNID;
        obj.codeid = closest.CODEID;
        obj.type = closest.TYPE;
      }
      return {
        region,
        ...obj,
        series: data
          .filter((d) => d.region === region)
          .flatMap((d) => d.series)
          .sort((a, b) => b.date - a.date),
      };
    });

  fs.writeFileSync(
    path.join(processedDir, "montreal-situation.json"),
    JSON.stringify(massagedData, null, 2),
    { encoding: "utf8" }
  );
})();

(async function () {
  const rawDir = path.join(__dirname, "raw", "montreal-emergency");
  const processedDir = path.join(__dirname, "processed", "montreal-emergency");
  let files = fs
    .readdirSync(rawDir)
    .filter((d) => fs.statSync(path.join(rawDir, d)).isFile())
    .slice()
    .sort();

  let data = [];
  for (const file of files) {
    let $ = cheerio.load(fs.readFileSync(path.join(rawDir, file), "utf8"));
    let updatestr = $("td.a20").text();
    let timestr = updatestr.match(/\d{1,2}h\d{2}/g)[0];
    let datestr = updatestr.match(/\d{1,2} [A-z]+ \d{4}/g)[0];
    let date = parseFrenchDate(datestr);
    let time = timestr.replace("h", ":");
    let jsdate = zonedTimeToUtc(date + " " + time, TIMEZONE);

    let [access_date, access_time] = file.split(" ");
    access_time = access_time.replace("h", ":");
    let jsaccessdate = zonedTimeToUtc(
      access_date + " " + access_time,
      TIMEZONE
    );

    let curdata = [];
    let curzone;
    Array.from($("table.a245 tr")).forEach((el) => {
      let tdlist = $(el).find("td");
      let firsttd = tdlist.first();
      if (firsttd.hasClass("a90cl")) {
        curzone = firsttd.text();
      } else if (firsttd.hasClass("a127c")) {
        let tdcontent = Array.from(tdlist).map((d) => $(d).text());

        let hospital = minBy(hospitals, (obj) =>
          lev.get(normalize(tdcontent[0]), normalize(obj.name))
        );

        curdata.push({
          name: tdcontent[0].trim(),
          lon: hospital.lon,
          lat: hospital.lat,
          zone: curzone,
          taux_occupation_civieres: +tdcontent[1],
          civieres: +tdcontent[2],
          patients_civieres: +tdcontent[3],
          patients_civieres_24h: +tdcontent[3],
          patients_civieres_48h: +tdcontent[4],
          patients_ambulance: +tdcontent[5],
          inscriptions: +tdcontent[6],
          inscriptions_sag: +tdcontent[7],
        });
      }
    });
    data.push({
      time,
      date,
      millis: jsdate.getTime(),
      access_time,
      access_date,
      access_millis: jsaccessdate.getTime(),
      values: curdata,
    });
  }

  fs.writeFileSync(
    path.join(processedDir, "montreal-emergency.json"),
    JSON.stringify(data, null, 2),
    { encoding: "utf8" }
  );
})();
