import * as GSheets from 'google-spreadsheet';
import * as Github from 'github';
import * as fs from 'fs';
import * as path from 'path';

var creds = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8'));
const GH_TOKEN = creds.gh_token;
const SHEET_KEY = creds.sheet_key;

class Startup {
  public static async main(): Promise<number> {
    console.log('Starting');
    let options: Github.Options = Object.create(null);
    options.debug = false;
    let gh = new Github(options);
    gh.authenticate({
      type:"token",
      token: GH_TOKEN
    });
    let params: Github.IssuesGetForRepoParams = Object.create(null)
    params.state = "open";
    params.owner = "eclipse";
    params.repo = "che";
    let res = await gh.issues.getForRepo(params);
    let issues = res.data;
    while (gh.hasNextPage(res)) {
      res = await gh.getNextPage(res);
      Array.prototype.push.apply(issues, res.data);
    }
    console.log('retrieved %d issues from Github', issues.length);
    let doc = new PrioritySheet();
    await doc.setAuth();

    const headers = ['number', 'name', 'link','status'];

    let sheets = {};
    sheets['kind/epic'] = await doc.getOrCreateSheet('epics');
    sheets['team/ide'] = await doc.getOrCreateSheet('team-ide');
    sheets['team/osio'] = await doc.getOrCreateSheet('team-osio');
    sheets['team/platform'] = await doc.getOrCreateSheet('team-platform');
    sheets['team/plugin'] = await doc.getOrCreateSheet('team-plugins');
    sheets['team/enterprise'] = await doc.getOrCreateSheet('team-ent');
    sheets['team/production'] = await doc.getOrCreateSheet('team-prod');
    sheets['team/support'] = await doc.getOrCreateSheet('team-support');
    for (let label in sheets) {
      let sheet = sheets[label];
      if(!sheet){
        console.log("No Sheet for label :" +label);
      }
      console.log('set header row for %s',label);
      await doc.setHeaderRow(sheet, headers);
      let rows = await doc.getRows(sheet, { offset: 1 });
      console.log('get %d rows for sheet %s',rows.length, sheet.title);
      let numbersInSheet = rows.map((r) => { return parseInt(r.number) });
      let allOpenIssueNumbers = issues.map((isu)=>{return parseInt(isu.number)});
      for(let i=0;i<rows.length;i++ ){
        if(rows[i].number && !Number.isNaN(rows[i].number)
            && allOpenIssueNumbers.indexOf(parseInt(rows[i].number)) === -1 ){
          console.log('remove issue number %d', rows[i].number);
          await rows[i].del();
        }
      }

      let existingIssues = issues.filter((i)=>{ return numbersInSheet.indexOf(i.number) > -1 });
      for(let i=0; i<existingIssues.length; i++){
        let rowToUpdate = rows.find((r)=>{ return r.number == existingIssues[i].number && r.name != existingIssues[i].title});
        if(rowToUpdate){
          console.log('update row with number %d',rowToUpdate.number);
          rowToUpdate.name = existingIssues[i].title;
          await rowToUpdate.save();
        }
      }

      let newIssues = issues
        .filter((i, index) => { return i.labels.find( l => { return l.name === label }) })
        .filter((i) => { return numbersInSheet.indexOf(i.number) === -1 });
      console.log('found %d new issues for %s',newIssues.length,sheet.title);
      for (let i=0; i < newIssues.length; i++) {
        let row = {
          name: newIssues[i].title,
          number: newIssues[i].number,
          link: newIssues[i].html_url
        }
        console.log('adding row with number '+ row.number);
        let r = await doc.addRow(sheet, row);
      }
    }

    return Promise.resolve(0);
  }
}

class PrioritySheet {
 private doc = new GSheets(SHEET_KEY);
  private info;

  public async setAuth(): Promise<any> {
    // see notes below for authentication instructions!
    return new Promise((resolve, reject) => {
      this.doc.useServiceAccountAuth(creds.google_creds, (err) => {
        if (err) reject();
        resolve();
      });
    });
  }

  public async getInfoAndWorksheets(): Promise<InfoData> {
    return new Promise<InfoData>((resolve, reject) => {
      if (!this.info) {
        this.info = this.doc.getInfo((err, info) => {
          if (err)
            reject(err);
          else
            resolve(info);
        });
      }

    });
  }

  public async addWorkSheet(opts): Promise<SpreadsheetWorksheet> {
    return new Promise<SpreadsheetWorksheet>((resolve, reject) => {
      this.doc.addWorksheet(opts, (err, sheet) => {
        if (err) {
          reject(err)
        }
        else {
          resolve(sheet);
          // invalidate cached info
          this.info = null;
        }
      });
    });
  }

  public async getOrCreateSheet(title: string): Promise<SpreadsheetWorksheet> {
    console.log('creating or finding sheet for title %s', title);
    let info = await this.getInfoAndWorksheets();
    let epicSheet = info.worksheets.find((sheet) => {
      return sheet.title.toUpperCase() == title.toUpperCase();
    });
    if (!epicSheet) {
      console.log('sheet for %s does not exist adding',title);
      return this.doc.addWorksheet({
        title: title
      });
    }
    return Promise.resolve<SpreadsheetWorksheet>(epicSheet);
  }

  public async setHeaderRow(sheet: SpreadsheetWorksheet, headers: string[]): Promise<any> {
    return new Promise((resolve, reject) => {
      sheet.setHeaderRow(headers, err => {
        if (err)
          reject(err);
        else
          resolve();
      });
    });
  }

  public async getRows(sheet: SpreadsheetWorksheet, opt: object): Promise<any> {
    return new Promise((resolve, reject) => {
      sheet.getRows(opt, (err, rows) => {
        if (err)
          reject(err);
        else
          resolve(rows);
      });
    });
  }

  public async addRow(sheet: SpreadsheetWorksheet, row: object): Promise<any> {
    return new Promise((resolve, reject) => {
      sheet.addRow(row, (err, rows) => {
        if (err)
          reject(err);
        else
          resolve(rows);
      });
    });
  }
}

//Definitions from google-spreadsheet
interface SpreadsheetWorksheet {
  title: string;
  setHeaderRow([], any);
  getRows(object, any);
  addRow(object, any);
}
interface InfoData {
  id: string;
  title: string;
  updated: string;
  author: string;
  worksheets: SpreadsheetWorksheet[];
}
Startup.main().then((v)=>{process.exit(v)}).catch((err)=>{console.error(err); process.exit(1);});
