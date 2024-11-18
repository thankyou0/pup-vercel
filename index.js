// import { Cluster } from "puppeteer-cluster";
const { Cluster } = require("puppeteer-cluster");
const app = require("express")();

let chrome = {};
let puppeteer;

if (process.env.AWS_LAMBDA_FUNCTION_VERSION) {
  chrome = require("chrome-aws-lambda");
  puppeteer = require("puppeteer-core");
} else {
  puppeteer = require("puppeteer");
}


const scanForLinks = async (page) => {
  const element = await page.$("div.SoaBEf");
  if (!element) {
    return [];
  }

  await page.waitForSelector("div.SoaBEf div.SoAPf div.MgUUmf.NUnG9d");

  const articles = await page.$$eval("div.SoaBEf", (articles) =>
    articles.map((article) => {
      const titleElement = article.querySelector("div.SoAPf div.n0jPhd.ynAwRc.MBeuO.nDgy9d");
      const linkElement = article.querySelector("a.WlydOe");
      const imgURLElement = article.querySelector("div.gpjNTe div.YEMaTe.JFSfwc div.uhHOwf.BYbUcd img");
      const timeElement = article.querySelector("div.SoAPf div.OSrXXb.rbYSKb.LfVVr");
      const providerImgElement = article.querySelector("div.SoAPf div.MgUUmf.NUnG9d g-img.QyR1Ze.ZGomKf img");
      const providerNameElement = article.querySelector("div.SoAPf div.MgUUmf.NUnG9d span");
      const someTextElement = article.querySelector("div.SoAPf div.GI74Re.nDgy9d");

      const articleData = {
        title: titleElement ? titleElement.textContent.trim() : null,
        someText: someTextElement ? someTextElement.textContent : null,
        link: linkElement ? linkElement.getAttribute("href") : null,
        imgURL: imgURLElement ? imgURLElement.getAttribute("src") : null,
        time: timeElement ? timeElement.textContent : null,
        providerImg: providerImgElement ? providerImgElement.getAttribute("src") : null,
        providerName: providerNameElement ? providerNameElement.textContent : null,
      };

      return articleData &&
        articleData.title &&
        articleData.someText &&
        articleData.link &&
        articleData.time &&
        articleData.providerImg &&
        articleData.providerName
        ? articleData
        : null;
    })
  );

  return articles.filter((article) => article !== null);
};

app.get("/topstories", async (req, res) => {
  
  try {
    const puppeteerOptions = {
      headless: process.env.AWS_LAMBDA_FUNCTION_VERSION ? chrome.headless : false,
      args: process.env.AWS_LAMBDA_FUNCTION_VERSION
        ? [...chrome.args, "--no-sandbox", "--disable-setuid-sandbox"]
        : ["--no-sandbox", "--disable-setuid-sandbox"],
      executablePath: process.env.AWS_LAMBDA_FUNCTION_VERSION ? await chrome.executablePath : undefined,
      defaultViewport: null,
    };

    const cluster = await Cluster.launch({
      concurrency: Cluster.CONCURRENCY_PAGE,
      maxConcurrency: 3,
      puppeteerOptions: puppeteerOptions,
    });

    cluster.on("taskerror", (err, data) => {
      console.error(`Error crawling ${data}: ${err.message}`);
    });

    let allArticles = [];

    await cluster.task(async ({ page, data: url }) => {
      console.log("url -->  ", url);

      // await page.setUserAgent(
      //   "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.864.48 Safari/537.36 Edg/91.0.864.48"
      // );

      await page.goto(url, { waitUntil: "networkidle2" });

      const articles = await scanForLinks(page);
      allArticles = [...allArticles, ...articles];
    });

    const searchURL = `https://www.google.com/search?q=dhoni&tbm=nws&start=`;

    for (let i = 0; i < 1; i++) {
      await cluster.queue(`${searchURL}${i * 10}`);
    }

    await cluster.idle();
    await cluster.close();

    console.log(allArticles.length);
    // return allArticles;
    res.send(allArticles);
  } catch (error) {
    console.error("An error occurred while scraping search data:", error);
    // return [];
    res.send(['error']);
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server started");
});

module.exports = app;
