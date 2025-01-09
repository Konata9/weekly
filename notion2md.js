// CommonJS imports
const { Client } = require('@notionhq/client');
const moment = require('moment');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Initialize environment
if (!process.env.GITHUB_ACTIONS) {
  dotenv.config();
}

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const databaseId = process.env.NOTION_DATABASE_ID;

const CONFIG = {
  days: 7,
  dir: './posts',
  filename: '每周见闻'
};

// Time utils
const getTimeRange = () => {
  const curTime = moment(Date.now());
  const today = curTime.format('YYYY-MM-DD');
  const startDay = moment(curTime).subtract(CONFIG.days, 'days').format('YYYY-MM-DD');
  return { today, startDay };
};

// Format utilities
const formatStr = (str) => {
  if (!str?.trim()) return str;

  const reg1 = /[<>'"]/g;
  const reg2 = /([^\n\r\t\s]*?)((http|https):\/\/[\w\-]+\.[\w\-]+[^\s]*)/g;

  const cleanStr = str.replace(reg1, '');
  return cleanStr.replace(reg2, (_, b, c) => `${b}<${c}>`);
};

const setMdImg = (img, txt) => {
  const desc = txt ? `<small>${txt}</small>\n\n` : '';
  return `<img src="${img}" width="800" />\n\n${desc}`;
};

// Notion data processing
const getNotionData = async (startDay, today) => {
  const response = await notion.databases.query({
    database_id: databaseId,
    filter: {
      and: [
        {
          property: 'Created time',
          date: {
            on_or_after: startDay
          }
        },
        {
          property: 'Created time',
          date: {
            before: today
          }
        }
      ]
    },
    sorts: [
      {
        property: "Created time",
        direction: "ascending"
      }
    ]
  });

  if (!response.results.length) {
    console.log('no data');
    return null;
  }

  return response.results;
};

const processPage = (page) => {
  const cover = page.cover?.external?.url || page.cover?.file?.url;
  const props = page.properties;

  return {
    title: props.Title?.title[0].plain_text,
    category: props.Category?.select?.name,
    url: props.URL?.url,
    content: props.Description?.rich_text.map(item => item.plain_text).join('') || '',
    img: props.img?.files[0]?.file?.url || props.img?.files[0]?.external?.url || '',
    imgDesc: props.imgDesc?.rich_text[0]?.plain_text || '',
    tag: props.Tags.multi_select ? props.Tags.multi_select.map(tag => tag.name).join(',') : props.Tags.select?.name,
    cover
  };
};

const generateMarkdown = (pages, today, startDay) => {
  const mid = `${startDay}_${today}`.replace(/-/g, '');
  const mdHead = `---\ndate: ${today.replace(/-/g, '/')}\ntoc: true\n---\n\n`;
  let mdContent = '';
  const secData = {};
  let mdImg = '';

  pages.forEach((page) => {
    const {
      title,
      url,
      category,
      content,
      img,
      imgDesc,
      tag,
      cover
    } = processPage(page);

    const targetStr = formatStr(content);
    const oneImg = cover ? `![](${cover})` : '';

    if (category) {
      if (!secData[category]) {
        secData[category] = [];
        secData[category].index = 0;
      }
      const idx = secData[category].index++;
      const titleWithUrl = url ? `[${title.trim()}](${url})` : title.trim();
      const oneMsg = `**${idx + 1}、${titleWithUrl}**\n标签：${tag}\n\n${targetStr}\n\n${oneImg}\n\n`;
      secData[category].push(oneMsg);
    }

    if (img) {
      mdImg = setMdImg(img, imgDesc);
    }
  });

  Object.keys(secData).forEach(key => {
    mdContent += `## ${key}\n${secData[key].join('')}`;
  });

  return { mid, mdHead, mdImg, mdContent };
};

// File operations
const getFilePath = (mid) => {
  const existingFiles = fs.readdirSync(CONFIG.dir).filter(file => !file.startsWith('.'));
  const existingFile = existingFiles.find(file => file.includes(mid));

  if (existingFile) {
    return path.join(CONFIG.dir, existingFile);
  }

  const fileCount = existingFiles.length + 1;
  const fileName = `${(fileCount < 10 ? '0' + fileCount : fileCount) + '-' + (CONFIG.filename || today)}-${mid}.md`;
  return path.join(CONFIG.dir, fileName);
};

const writeMarkdownFile = (filePath, mdHead, mdImg, mdContent) => {
  const fileContent = `${mdHead}${mdImg}${mdContent}`;
  fs.writeFileSync(filePath, fileContent);
};

// Main function
const main = async () => {
  try {
    const { today, startDay } = getTimeRange();

    console.log(`[INFO]: Processing data between ${startDay} and ${today}`);

    const pages = await getNotionData(startDay, today);

    if (!pages) return;

    const { mid, mdHead, mdImg, mdContent } = generateMarkdown(pages, today, startDay);
    const filePath = getFilePath(mid);
    writeMarkdownFile(filePath, mdHead, mdImg, mdContent);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
};

main();
