const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const { zonedTimeToUtc, utcToZonedTime, format } = require("date-fns-tz");

const TIMEZONE = "America/Montreal";

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
    let table = $("#c38710 table")
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

    const parseRow = (row) => ({
      region: row[0].trim().replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, ""),
      series: [
        {
          date_est:
            name.split(" ")[0] + " " + name.split(" ")[1].replace("h", ":"),
          millis: date.getTime(),
          cas: parseNum(row[1]),
          cas_pct: parseNum(row[2]),
          taux: parseNum(row[3]),
          imprecis: row[3].includes("*"),
        },
      ],
    });

    let tablerows = table.find("tr");
    let rowarr = Array.from(tablerows)
      .map((el) => Array.from($(el).find("td")).map((el) => $(el).text()))
      .filter((d) => d.length > 0);
    return rowarr.map((d) => parseRow(d));
  });

  let massagedData = data
    .map((d) => d.region)
    .filter((d, i, arr) => arr.indexOf(d) === i)
    .map((region) => ({
      region,
      series: data
        .filter((d) => d.region === region)
        .flatMap((d) => d.series)
        .sort((a, b) => b.date - a.date),
    }));

  fs.writeFileSync(
    path.join(processedDir, "montreal-situation.json"),
    JSON.stringify(massagedData, null, 2),
    { encoding: "utf8" }
  );
})();
