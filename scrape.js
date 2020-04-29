const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { zonedTimeToUtc, utcToZonedTime, format } = require("date-fns-tz");
const cheerio = require("cheerio");

const TIMEZONE = "America/Montreal";

function getCurrentDate() {
  return format(utcToZonedTime(Date.now(), TIMEZONE), `yyyy-MM-dd HH'h'mm`, {
    timeZone: TIMEZONE,
  });
}

function getDateFromFileName(fileName) {
  let split = fileName.split(" ");
  let date = split[0];
  let time = split[1].split("h").join(":") + ":00";
  zonedTimeToUtc(`${date} ${time}`, TIMEZONE);
}

(async function () {
  const situationDir = path.join(__dirname, "raw", "quebec-situation");

  const response = await axios.get(
    "https://www.quebec.ca/sante/problemes-de-sante/a-z/coronavirus-2019/situation-coronavirus-quebec/#c47900"
  );

  let oldfiles = fs
    .readdirSync(situationDir)
    .map((d) => path.join(situationDir, d))
    .filter((d) => fs.statSync(d).isFile())
    .slice()
    .sort();
  let isRepeat = false;
  if (oldfiles.length > 0) {
    let mostrecent = fs.readFileSync(oldfiles[oldfiles.length - 1], {
      encoding: "utf8",
    });
    let $1 = cheerio.load(mostrecent);
    let $2 = cheerio.load(response.data);
    isRepeat = $1("#main").html() === $2("#main").html();
  }

  if (!isRepeat) {
    fs.writeFileSync(
      path.join(situationDir, `${getCurrentDate()} quebec situation.html`),
      response.data,
      { encoding: "utf8" }
    );
  }
})();
