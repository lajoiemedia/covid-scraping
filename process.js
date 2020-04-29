const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const TIMEZONE = "America/Montreal";

(async function () {
  const situationDir = path.join(__dirname, "raw", "quebec-situation");
  let files = fs
    .readdirSync(situationDir)
    .filter((d) => fs.statSync(path.join(situationDir, d)).isFile())
    .slice()
    .sort();
  let onlyLastFiles = files.filter(
    (d, i, arr) =>
      i === arr.length - 1 || d.split(" ")[0] !== arr[i + 1].split(" ")[0]
  );
  let data = onlyLastFiles.map((name) => {
    let $ = cheerio.load(
      fs.readFileSync(path.join(situationDir, name), { encoding: "utf8" })
    );

    let table = $(".contenttable").filter((i, el) => {
      let ths = $(el).find("th");
      console.log(ths.first().text());

      return (
        ths &&
        ths.length > 0 &&
        ths.first().text().toLowerCase().trim().startsWith("arrondissement")
      );
    });

    //console.log(table);
    /*.map(tr => {
      
    })*/
  });
})();
