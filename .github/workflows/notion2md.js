// commonjs mode, you can also use `import` for module mode
const { Client } = require('@notionhq/client');
const moment = require('moment');
const fs = require('fs');
const path = require('path');
const dotEnv = require('dotenv')

if (!process.env.GITHUB_ACTIONS) {
  dotEnv.config();
}

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const databaseId = process.env.NOTION_DATABASE_ID;

const CONFIG ={
  days: 7,
  dir:'./posts',
  filename:'每周见闻'
}

const curTime = moment(Date.now());
const today = curTime.format('YYYY-MM-DD');
const startDay = moment(curTime).subtract(CONFIG.days, 'days').format('YYYY-MM-DD')

function formatStr(str) {
  const reg1 = /[<>'"]/g
  const reg2 = /([^\n\r\t\s]*?)((http|https):\/\/[\w\-]+\.[\w\-]+[^\s]*)/g

  if (!!str && str.trim()) {
    str = str.replace(reg1, '')
    const url = str.replace(reg2, (a, b, c)=> (b + '<' + c + '>'))
    return url
  }
  return str
}

async function main() {
  try {
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
        ],
        sorts: [
          {
            property: "Created time",
            direction: "ascending"
          }
        ],
      }
    });

    if(!response.results.length){
      console.log('no data')
      return
    }

    let mid = (`${startDay}_${today}`).replace(/-/g,'')
    let mdHead = `---\ndate: ${today.replace(/-/g,'/')}\ntoc: true\n---\n\n`
    let mdContent = ''
    let secData = {}
    let mdImg = ''

    function setMdImg(img,txt){
      let desc = txt ? `<small>${txt}</small>\n\n` : ''
      return `<img src="${img}" width="800" />\n\n${desc}`
    }

    let index = 0;
    for (const page of response.results) {
      console.log('===== page results ====')
      console.log(page)

      const cover = page.cover?.external?.url || page.cover?.file.url

      const props = page.properties
      const title = props.Title?.title[0].plain_text
      const category = props.Category?.select?.name

      const url = props.URL?.url

      const content = props.Description?.rich_text.map(item => item.plain_text).join('') || ''
      const img = props.img?.files[0]?.file?.url || props.img?.files[0]?.external?.url || ''
      const imgDesc = props.imgDesc?.rich_text[0]?.plain_text || ''

      const _content = content
      const targetStr = formatStr(_content)
      const tag = (props.Tags.multi_select && props.Tags.multi_select[0]?.name) || props.Tags.select?.name // support multi-select and single select
      const oneImg = cover ? `![](${cover})`:''

      if (tag) {
        if (!secData[category]) {
          secData[category] = []
          secData[category].index = 0
        }
        let idx = secData[category].index++ // hack
        const oneMsg =`**${idx+1}、${title.trim()}**\n\n${targetStr}\n\n${oneImg}\n\n`
        secData[category].push(oneMsg)
      }

      if (img) {
        mdImg = setMdImg(img,imgDesc)
      }

      index+=1;
    }

    Object.keys(secData).map(key=>{
      mdContent+=`## ${key}\n${secData[key].join('')}`
    })

    const existingFiles = fs.readdirSync(CONFIG.dir).filter(file => !file.startsWith('.')) // ignore hidden files
    const existingFile = existingFiles.find(file => file.includes(mid));

    let filePath = ''
    if (existingFile) {
      filePath = path.join(CONFIG.dir, existingFile);
    } else {
      const fileCount = existingFiles.length + 1;
      const fileName = `${(fileCount < 10 ? '0' + fileCount : fileCount) + '-' + (CONFIG.filename || today)}-${mid}.md`;
      filePath = path.join(CONFIG.dir, fileName);
    }

    const fileContent = `${mdHead + mdImg + mdContent}`;
    fs.writeFileSync(filePath, fileContent);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main()
