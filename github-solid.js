// Github chat data to solid
// like GITTER_TOKEN 1223487...984 node solid-github.js

require('dotenv').config()
const { Octokit } = require('@octokit/rest')

const fetch = require('node-fetch')

const command = process.argv[2]
const targetProjectName = process.argv[3] // solid/solid-ui/1
const archiveBaseURI = process.argv[4] // like 'https://timbl.com/timbl/Public/Archive/'
/*
if (command !== 'list' && !archiveBaseURI) {
  console.error('syntax:  node solid=github.js  <command> <chatproject>  <solid archive root>')
  process.exit(1)
}
*/

const GITHUB_TOKEN = process.env.GITHUB_TOKEN
if (!GITHUB_TOKEN) {
  console.error('No github access control')
}
const octokit = new Octokit({

  auth: GITHUB_TOKEN,

  userAgent: 'github-solid',

  timeZone: 'Europe/Amsterdam',

   logs: { debug: () => {},
    info: () => {},
    warn: console.warn,
    error: console.error}

})

const fetchOptions = {
        method: 'get',
        //body:    JSON.stringify(body),
        headers: { 'Accept': 'application/json',
      'User-Agent': 'github-solid' },
}
// var Github = require('node-github')
var $rdf = require('rdflib')
const solidNamespace = require('solid-namespace')
const ns = solidNamespace($rdf)

if (!ns.wf) {
  ns.wf = new $rdf.Namespace('http://www.w3.org/2005/01/wf/flow#') //  @@ sheck why necessary
}
const readline = require('readline')

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true
})

function question (q) {
  return new Promise((resolve, reject) => {
    rl.question(q + ' ', (a) => { // space for answer not to be crowded
      rl.close()
      resolve(a)
    })
  })
}

async function confirm (q) {
  while (1) {
    var a = await question(q)
    if (a === 'yes' || a === 'y') return true
    if (a === 'no' || a === 'n') return false
    console.log('  Please reply y or n')
  }
}
/* Solid Authentication
*/
/*
const SOLID_TOKEN = process.env.SOLID_TOKEN
console.log('SOLID_TOKEN ' + SOLID_TOKEN.length)
if (!SOLID_TOKEN) {
  console.log('NO SOLID TOKEN')
  process.exit(2)
}
*/

const normalOptions = {
//   headers: {Authorization: 'Bearer ' + SOLID_TOKEN}
}
const forcingOptions = {
  // headers: {Authorization: 'Bearer ' + SOLID_TOKEN},
  force: true }

function clone (options) {
  return Object.assign({}, options)
}

/// ///////////////////////////// Solid Bits

const store = $rdf.graph()
const kb = store // shorthand -- knowledge base


const auth = require('solid-auth-cli') // https://www.npmjs.com/package/solid-auth-cli

const fetcher = $rdf.fetcher(store, {fetch: auth.fetch, timeout: 900000})

// const fetcher = new $rdf.Fetcher(store, {timeout: 900000}) // ms
const updater = new $rdf.UpdateManager(store)
// const updater = new $rdf.UpdateManager(store)

function delayMs (ms) {
  console.log('pause ... ')
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function solidObjectForGithubURI (githubURL, githubType) {
  var githubObject
  try {
    githubObject = loadGithubObject(githubURL)
  } catch (err) {
    console.error('### Error trying to load github object at ' + githubURL)
  }
  return solidObjectFor(githubObject, githubType)
}

function solidObjectFor (githubObject, githubType) {
  const id = encodeURIComponent(githubObject.id)
  const map = {
    'project': 'index.ttl#theBoard',
    'tracker': 'index.ttl#this',
    'card':   'state.ttl#task_' + id,
    'column': 'index.ttl#category_' + id,
    'user': `Person/${id}/index.ttl#this`
  }
  if (map.hasOwnProperty(githubType)) {
    return $rdf.sym(archiveBaseURI + map[githubType])
  } else {
    throw new Error('Bad github type ' + githubType)
  }
}

/** Track github users
*/

async function putResource (doc) {
  delete fetcher.requested[doc.uri] // invalidate read cache @@ should be done by fetcher in future
  return fetcher.putBack(doc, clone(normalOptions))
}

async function loadIfExists (doc) {
  try {
    // delete fetcher.requested[doc.uri]
    await fetcher.load(doc, clone(normalOptions))
    return true
  } catch (err) {
    if (err.response && err.response.status && err.response.status === 404) {
      // console.log('    No chat file yet, creating later ' + doc)
      return false
    } else {
      console.log(' #### Error reading  file ' + err)
      console.log('            error object  ' + JSON.stringify(err))
      console.log('        err.response   ' + err.response)
      console.log('        err.response.status   ' + err.response.status)
      process.exit(4)
    }
  }
}


async function saveEverythingBack () {
  console.log('Saving all modified files:')
  for (let uri in toBePut) {
    if (toBePut.hasOwnProperty(uri)) {
      console.log(' Putting ' + uri)
      await putResource($rdf.sym(uri))
      delete fetcher.requested[uri] // invalidate read cache @@ should be done by fether in future
    }
  }
  console.log('Saved all modified files.')
  toBePut = []
}

async function authorFromGithub (fromUser, archiveBaseURI) {
  async function saveUserData (fromUser, person) {
    const doc = person.doc()
    store.add(person, ns.rdf('type'), ns.vcard('Individual'), doc)
    store.add(person, ns.rdf('type'), ns.foaf('Person'), doc)
    // store.add(person, ns.vcard('fn'), fromUser.displayName, doc)
    store.add(person, ns.foaf('homepage'), fromUser.html_url, doc)
    store.add(person, ns.foaf('nick'), fromUser.login, doc)
    if (fromUser.avatar_url) {
      store.add(person, ns.vcard('photo'), $rdf.sym(fromUser.avatar_url), doc)
    }
    toBePut[doc.uri] = true
  }

  const peopleBaseURI = archiveBaseURI + 'Person/'
  var person = $rdf.sym(peopleBaseURI + encodeURIComponent(fromUser.id) + '/index.ttl#this')
  // console.log('     person id: ' + fromUser.id)
  // console.log('     person solid: ' + person)
  if (peopleDone[person.uri]) {
    console.log('    person already saved ' + fromUser.username)
    return person
  }
  var doc = person.doc()
  if (toBePut[doc.uri]) { // already have stuff to save -> no need to load
    // console.log(' (already started to person file) ' + doc)
  } else {
    try {
      console.log(' fetching person file: ' + doc)

      await fetcher.load(doc, clone(normalOptions)) // If exists, fine... leave it
    } catch (err) {
      if (err.response && err.response.status && err.response.status === 404) {
        console.log('No person file yet, creating ' + person)
        await saveUserData(fromUser, person) // Patch the file into existence
        peopleDone[person.uri] = true
        return person
      } else {
        console.log(' #### Error reading person file ' + err)
        console.log(' #### Error reading person file   ' + JSON.stringify(err))
        console.log('        err.response   ' + err.response)
        console.log('        err.response.status   ' + err.response.status)
        process.exit(8)
      }
    }
    peopleDone[person.uri] = true
  }
  return person
}


/// /////////////////////////////


async function loadConfig () {
  console.log('Log into solid')
  var session = await auth.login({
    idp: process.env.SOLID_IDP,
    username: process.env.SOLID_USERNAME,
    password: process.env.SOLID_PASSWORD
  })
  var webId = session.webId
  const me = $rdf.sym(webId)
  console.log('Logged in to Solid as ' + me)
  var githubConfig = {}

  await fetcher.load(me.doc())
  const prefs = kb.the(me, ns.space('preferencesFile'), null, me.doc())
  console.log('Loading prefs ' + prefs)
  await fetcher.load(prefs)
  console.log('Loaded prefs ✅')

  var config = kb.the(me, ns.solid('githubConfiguationFile'), null, prefs)
  if (!config) {
    console.log('You don\'t have a github configuration. ')
    config = $rdf.sym(prefs.dir().uri + 'githubConfiguration.ttl')
    if (await confirm('Make a github config file now in your pod at ' + config)) {
      console.log('    putting ' + config)
      await kb.fetcher.webOperation('PUT', config.uri, {data: '', contentType: 'text/turtle'})
      console.log('    getting ' + config)
      await kb.fetcher.load(config)
      await kb.updater.update([], [$rdf.st(me, ns.solid('githubConfiguationFile'), config, prefs)])
      await kb.updater.update([], [$rdf.st(config, ns.dc('title'), 'My github config file', config)])
      console.log('Made new github config: ' + config)
    } else {
      console.log('Ok, exiting, no github config')
      process.exit(4)
    }
  } else {
    await fetcher.load(config)
  }
  console.log('Have github config ✅')

  for (var opt of opts) {
    var x = kb.anyValue(me, ns.solid(opt))
    console.log(` Config option ${opt}: "${x}"`)
    if (x) {
      githubConfig[opt] = x.trim()
    } else {
      console.log('\nThis must a a full https: URI ending in a slash, which folder on your pod you want github chat stored.')
      x = await question('Value for ' + opt + '?')
      if (x.length > 0 && x.endsWith('/')) {
        await kb.updater.update([], [$rdf.st(me, ns.solid(opt), x, config)])
        console.log(`saved config ${opt} =  ${x}`)
      } else {
        console.log('abort. exit.')
        process.exit(6)
      }
    }
    githubConfig[opt] = x
  }
  console.log('We have all config data ✅')
  return githubConfig
}

///////////////////////////////////////////////////////////////

async function getListing (api, params) {
  console.log(`    Getting list with `)
  var results = []
  try {
    results = await octokit.paginate(api, params)
  } catch (err) {
     console.error(`Error trying to do list:  ${err}`)
  }
  return results
}

var templates = []

templates['project'] = {
    "owner_url": "https://api.github.com/repos/solid/mashlib",
    "url": "https://api.github.com/projects/4415090",
    "html_url": {property: ns.foaf('homePage'), valueType: 'node', example: "https://github.com/solid/mashlib/projects/1"},
    "columns_url": "https://api.github.com/projects/4415090/columns",
    "id": 4415090,
    "node_id": "MDc6UHJvamVjdDQ0MTUwOTA=",
    "name": {property: ns.dc('title'), valueType: 'string', example: "Mashlib release"},
    "body": { property: ns.wf('description'), valueType: 'string', example: "Coordinating solid-panes solid-ui and rdflib particularly"},
    "number": 1,
    "state": { property: ns.rdf('type'), valueType: 'state', example: "closed"},
    "creator": { property: ns.dct('creator'), valueType: 'object', range: 'user' },

    "created_at": {property: ns.dct('created'), valueType: 'dateTime', example: "2020-04-30T11:45:34Z"},
    "updated_at": {property: ns.dct('modified'), valueType: 'dateTime', example:"2020-04-30T19:21:36Z"},
}


templates['issue'] = {
  "url": "https://api.github.com/repos/solid/mashlib/issues/91",
  "repository_url": "https://api.github.com/repos/solid/mashlib",
  "labels_url": "https://api.github.com/repos/solid/mashlib/issues/91/labels{/name}",
  "comments_url": "https://api.github.com/repos/solid/mashlib/issues/91/comments",
  "events_url": "https://api.github.com/repos/solid/mashlib/issues/91/events",
  "html_url":  {property: ns.foaf('homePage'), valueType: 'node', example: "https://github.com/solid/mashlib/pull/91"},
  "id": 609865355,
  "node_id": "MDExOlB1bGxSZXF1ZXN0NDExMzg0MjQ5",
  "number": 91,
  "title": {property: ns.dc('title'), valueType: 'string', example: "Removing unnecessary castings"},

  "user": {property: ns.dct('creator'),  valueType: 'object', range: 'user'}, // @@ check prop
  "labels": [],
  "locked": { valueType: 'boolean', example: "false"},
  "state": { property: ns.rdf('type'), valueType: 'state', example: "closed"},
  "assignee": { property: ns.wf('assignee'), valueType: 'object', range: 'user', example: null},
  "assignees": { property: ns.wf('assignee'), valueType: 'array', range: 'user', example: []}, // @@ check
  "milestone": null,
  "comments": 0,
  "created_at": {property: ns.dct('created'), valueType: 'dateTime', example: "2020-04-30T11:45:34Z"},
  "updated_at": {property: ns.dct('modified'), valueType: 'dateTime', example:"2020-04-30T19:21:36Z"},
  "closed_at": {property: ns.wf('timeClosed'), valueType: 'dateTime', example:"2020-04-30T19:21:32Z"},
  "author_association": "CONTRIBUTOR",
  "active_lock_reason": null,
  "pull_request": {property_no: ns.wf('attachment'), valueType_no: 'object', range: 'pull'},
  "body": { property: ns.wf('description'), valueType: 'string', example: "Relies on https://github.com/solid/solid-ui/pull/304"},
  "closed_by": { property: ns.wf('closedBy'), valueType: 'object', range: 'user' },
}

templates ['pull-no'] = {
  "url": "https://api.github.com/repos/solid/mashlib/pulls/91",
  "html_url": "https://github.com/solid/mashlib/pull/91",
  "diff_url": "https://github.com/solid/mashlib/pull/91.diff",
  "patch_url": "https://github.com/solid/mashlib/pull/91.patch"
}

templates['card'] = {
  "url": "https://api.github.com/projects/columns/cards/37233905",
  "project_url": "https://api.github.com/projects/4415090",
  "id": 37233905,
  "node_id": "MDExOlByb2plY3RDYXJkMzcyMzM5MDU=",
  "note": { property: ns.wf('description'), valueType: 'string', example: "https://github.com/linkeddata/rdflib.js/pull/398\r\n"},
  "archived": false,
  "creator": { property: ns.dct('creator'), valueType: 'object', range: 'user' },

// These are the ones for a card which is  a card for an issue:

  "user": {property: ns.dct('author'),  valueType: 'object', range: 'user'}, // @@ check prop  diff with craetor?
  "labels": [],
  "locked": { valueType: 'boolean', example: "false"},
  "state": { property: ns.rdf('type'), valueType: 'state', example: "closed"},
  "assignee": { property: ns.wf('assignee'), valueType: '',exmaple: null},
  "assignees": [], // @@ do these
  "closed_at": {property: ns.wf('timeClosed'), valueType: 'dateTime', example:"2020-04-30T19:21:32Z"},
  "author_association": "CONTRIBUTOR",
  "closed_by": { valueType: 'object', range: 'user' },
  "comments": 0,
  "body": { property: ns.wf('description'), valueType: 'string', example: "Relies on https://github.com/solid/solid-ui/pull/304"},
  "repository_url": { property: ns.wf('attachment'), valueType: 'node', example: "https://api.github.com/repos/solid/mashlib" },
  "labels_url": {  example: "https://api.github.com/repos/solid/mashlib/issues/91/labels{/name}"},
  "comments_url": { example: "https://api.github.com/repos/solid/mashlib/issues/91/comments"},
  "events_url": { example: "https://api.github.com/repos/solid/mashlib/issues/91/events"},
  "html_url": { property: ns.wf('attachment'), valueType: 'node',  example: "https://github.com/solid/mashlib/pull/91"},
  "created_at": { property: ns.dct('created'), valueType: 'dateTime', example: "2020-04-29T12:57:56Z"},
  "updated_at": { property: ns.dct('modified'), valueType: 'dateTime', example: "2020-04-29T12:57:56Z"},
  "column_url": { example: "https://api.github.com/projects/columns/9637025"},
  "content_url": { example: "https://api.github.com/repos/solid/mashlib/issues/91"},
  "number": { example: "91"},
  "title": {property: ns.dc('title'), valueType: 'string', example: "Removing unnecessary castings"},
  "pull_request": {property_no: ns.wf('attachment'), valueType_no: 'object', range: 'pull'},

}

templates['user'] = {
  "login": { property: ns.foaf('nick'), valueType: 'string', example: "megoth"},
  "id": 775139,
  "node_id": "MDQ6VXNlcjc3NTEzOQ==",
  "avatar_url": {property: ns.vcard('photo'), valueType: 'node', example: "https://avatars0.githubusercontent.com/u/775139?v=4"},
  "gravatar_id": "",
  "url": "https://api.github.com/users/megoth",
  "html_url": {property: ns.foaf('homePage'), valueType: 'node', example:"https://github.com/megoth"},
  "followers_url": "https://api.github.com/users/megoth/followers",
  "following_url": "https://api.github.com/users/megoth/following{/other_user}",
  "gists_url": "https://api.github.com/users/megoth/gists{/gist_id}",
  "starred_url": "https://api.github.com/users/megoth/starred{/owner}{/repo}",
  "subscriptions_url": "https://api.github.com/users/megoth/subscriptions",
  "organizations_url": "https://api.github.com/users/megoth/orgs",
  "repos_url": "https://api.github.com/users/megoth/repos",
  "events_url": "https://api.github.com/users/megoth/events{/privacy}",
  "received_events_url": "https://api.github.com/users/megoth/received_events",
  "type": { property: ns.rdf('type'), valueType: 'agentType', example: "User"}, // or Organization
  "site_admin": false
}

templates['pull'] = {
  "url": "https://api.github.com/repos/solid/mashlib/pulls/91",
  "id": 411384249,
  "node_id": "MDExOlB1bGxSZXF1ZXN0NDExMzg0MjQ5",
  "html_url": "https://github.com/solid/mashlib/pull/91",
  "diff_url": "https://github.com/solid/mashlib/pull/91.diff",
  "patch_url": "https://github.com/solid/mashlib/pull/91.patch",
  "issue_url": "https://api.github.com/repos/solid/mashlib/issues/91",
  "number": 91,
  "state": "closed",
  "locked": false,
  "title": "Removing unnecessary castings",
  "user": {  },
  "body": "Relies on https://github.com/solid/solid-ui/pull/304",
  "created_at": "2020-04-30T11:45:34Z",
  "updated_at": "2020-04-30T19:21:36Z",
  "closed_at": "2020-04-30T19:21:32Z",
  "merged_at": "2020-04-30T19:21:32Z",
  "merge_commit_sha": "9a264b03ad604ea5000acd2821061c1c9223f97b",
  "assignee": null,
  "assignees": [ ],
  "requested_reviewers": [ ],
  "requested_teams": [ ],
  "labels": [ ],
  "milestone": null,
  "draft": false,
  "commits_url": "https://api.github.com/repos/solid/mashlib/pulls/91/commits",
  "review_comments_url": "https://api.github.com/repos/solid/mashlib/pulls/91/comments",
  "review_comment_url": "https://api.github.com/repos/solid/mashlib/pulls/comments{/number}",
  "comments_url": "https://api.github.com/repos/solid/mashlib/issues/91/comments",
  "statuses_url": "https://api.github.com/repos/solid/mashlib/statuses/c29ad227af3725c135d041d4415b2c90e67711dc",
  "head": {
    "label": "solid:rdflib-typing-fix",
    "ref": "rdflib-typing-fix",
    "sha": "c29ad227af3725c135d041d4415b2c90e67711dc",
    "user": {
      "login": "solid",
      "id": 14262490,
      "node_id": "MDEyOk9yZ2FuaXphdGlvbjE0MjYyNDkw",
      "avatar_url": "https://avatars0.githubusercontent.com/u/14262490?v=4",
      "gravatar_id": "",
      "url": "https://api.github.com/users/solid",
      "html_url": "https://github.com/solid",
      "followers_url": "https://api.github.com/users/solid/followers",
      "following_url": "https://api.github.com/users/solid/following{/other_user}",
      "gists_url": "https://api.github.com/users/solid/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/solid/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/solid/subscriptions",
      "organizations_url": "https://api.github.com/users/solid/orgs",
      "repos_url": "https://api.github.com/users/solid/repos",
      "events_url": "https://api.github.com/users/solid/events{/privacy}",
      "received_events_url": "https://api.github.com/users/solid/received_events",
      "type": "Organization",
      "site_admin": false
    },
    "repo": {
      "id": 58017436,
      "node_id": "MDEwOlJlcG9zaXRvcnk1ODAxNzQzNg==",
      "name": "mashlib",
      "full_name": "solid/mashlib",
      "private": false,
      "owner": {
        "login": "solid",
        "id": 14262490,
        "node_id": "MDEyOk9yZ2FuaXphdGlvbjE0MjYyNDkw",
        "avatar_url": "https://avatars0.githubusercontent.com/u/14262490?v=4",
        "gravatar_id": "",
        "url": "https://api.github.com/users/solid",
        "html_url": "https://github.com/solid",
        "followers_url": "https://api.github.com/users/solid/followers",
        "following_url": "https://api.github.com/users/solid/following{/other_user}",
        "gists_url": "https://api.github.com/users/solid/gists{/gist_id}",
        "starred_url": "https://api.github.com/users/solid/starred{/owner}{/repo}",
        "subscriptions_url": "https://api.github.com/users/solid/subscriptions",
        "organizations_url": "https://api.github.com/users/solid/orgs",
        "repos_url": "https://api.github.com/users/solid/repos",
        "events_url": "https://api.github.com/users/solid/events{/privacy}",
        "received_events_url": "https://api.github.com/users/solid/received_events",
        "type": "Organization",
        "site_admin": false
      },
      "html_url": "https://github.com/solid/mashlib",
      "description": "Solid-compatible data mashup library and Data Browser",
      "fork": false,
      "url": "https://api.github.com/repos/solid/mashlib",
      "forks_url": "https://api.github.com/repos/solid/mashlib/forks",
      "keys_url": "https://api.github.com/repos/solid/mashlib/keys{/key_id}",
      "collaborators_url": "https://api.github.com/repos/solid/mashlib/collaborators{/collaborator}",
      "teams_url": "https://api.github.com/repos/solid/mashlib/teams",
      "hooks_url": "https://api.github.com/repos/solid/mashlib/hooks",
      "issue_events_url": "https://api.github.com/repos/solid/mashlib/issues/events{/number}",
      "events_url": "https://api.github.com/repos/solid/mashlib/events",
      "assignees_url": "https://api.github.com/repos/solid/mashlib/assignees{/user}",
      "branches_url": "https://api.github.com/repos/solid/mashlib/branches{/branch}",
      "tags_url": "https://api.github.com/repos/solid/mashlib/tags",
      "blobs_url": "https://api.github.com/repos/solid/mashlib/git/blobs{/sha}",
      "git_tags_url": "https://api.github.com/repos/solid/mashlib/git/tags{/sha}",
      "git_refs_url": "https://api.github.com/repos/solid/mashlib/git/refs{/sha}",
      "trees_url": "https://api.github.com/repos/solid/mashlib/git/trees{/sha}",
      "statuses_url": "https://api.github.com/repos/solid/mashlib/statuses/{sha}",
      "languages_url": "https://api.github.com/repos/solid/mashlib/languages",
      "stargazers_url": "https://api.github.com/repos/solid/mashlib/stargazers",
      "contributors_url": "https://api.github.com/repos/solid/mashlib/contributors",
      "subscribers_url": "https://api.github.com/repos/solid/mashlib/subscribers",
      "subscription_url": "https://api.github.com/repos/solid/mashlib/subscription",
      "commits_url": "https://api.github.com/repos/solid/mashlib/commits{/sha}",
      "git_commits_url": "https://api.github.com/repos/solid/mashlib/git/commits{/sha}",
      "comments_url": "https://api.github.com/repos/solid/mashlib/comments{/number}",
      "issue_comment_url": "https://api.github.com/repos/solid/mashlib/issues/comments{/number}",
      "contents_url": "https://api.github.com/repos/solid/mashlib/contents/{+path}",
      "compare_url": "https://api.github.com/repos/solid/mashlib/compare/{base}...{head}",
      "merges_url": "https://api.github.com/repos/solid/mashlib/merges",
      "archive_url": "https://api.github.com/repos/solid/mashlib/{archive_format}{/ref}",
      "downloads_url": "https://api.github.com/repos/solid/mashlib/downloads",
      "issues_url": "https://api.github.com/repos/solid/mashlib/issues{/number}",
      "pulls_url": "https://api.github.com/repos/solid/mashlib/pulls{/number}",
      "milestones_url": "https://api.github.com/repos/solid/mashlib/milestones{/number}",
      "notifications_url": "https://api.github.com/repos/solid/mashlib/notifications{?since,all,participating}",
      "labels_url": "https://api.github.com/repos/solid/mashlib/labels{/name}",
      "releases_url": "https://api.github.com/repos/solid/mashlib/releases{/id}",
      "deployments_url": "https://api.github.com/repos/solid/mashlib/deployments",
      "created_at": "2016-05-04T02:41:18Z",
      "updated_at": "2020-07-09T12:36:06Z",
      "pushed_at": "2020-07-09T11:56:57Z",
      "git_url": "git://github.com/solid/mashlib.git",
      "ssh_url": "git@github.com:solid/mashlib.git",
      "clone_url": "https://github.com/solid/mashlib.git",
      "svn_url": "https://github.com/solid/mashlib",
      "homepage": "https://solid.github.io/mashlib/dist/mashlib.min.js",
      "size": 56823,
      "stargazers_count": 49,
      "watchers_count": 49,
      "language": "CSS",
      "has_issues": true,
      "has_projects": true,
      "has_downloads": true,
      "has_wiki": true,
      "has_pages": true,
      "forks_count": 24,
      "mirror_url": null,
      "archived": false,
      "disabled": false,
      "open_issues_count": 23,
      "license": {
        "key": "mit",
        "name": "MIT License",
        "spdx_id": "MIT",
        "url": "https://api.github.com/licenses/mit",
        "node_id": "MDc6TGljZW5zZTEz"
      },
      "forks": 24,
      "open_issues": 23,
      "watchers": 49,
      "default_branch": "master"
    }
  },
  "base": {
    "label": "solid:master",
    "ref": "master",
    "sha": "e50fc35b2f65351965bfbcc8e9ab543f52d3e4e7",
    "user": {
      "login": "solid",
      "id": 14262490,
      "node_id": "MDEyOk9yZ2FuaXphdGlvbjE0MjYyNDkw",
      "avatar_url": "https://avatars0.githubusercontent.com/u/14262490?v=4",
      "gravatar_id": "",
      "url": "https://api.github.com/users/solid",
      "html_url": "https://github.com/solid",
      "followers_url": "https://api.github.com/users/solid/followers",
      "following_url": "https://api.github.com/users/solid/following{/other_user}",
      "gists_url": "https://api.github.com/users/solid/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/solid/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/solid/subscriptions",
      "organizations_url": "https://api.github.com/users/solid/orgs",
      "repos_url": "https://api.github.com/users/solid/repos",
      "events_url": "https://api.github.com/users/solid/events{/privacy}",
      "received_events_url": "https://api.github.com/users/solid/received_events",
      "type": "Organization",
      "site_admin": false
    },
    "repo": { range: 'repo'
    },

  }, // base
  "_links": {
    "self": {
      "href": "https://api.github.com/repos/solid/mashlib/pulls/91"
    },
    "html": {
      "href": "https://github.com/solid/mashlib/pull/91"
    },
    "issue": {
      "href": "https://api.github.com/repos/solid/mashlib/issues/91"
    },
    "comments": {
      "href": "https://api.github.com/repos/solid/mashlib/issues/91/comments"
    },
    "review_comments": {
      "href": "https://api.github.com/repos/solid/mashlib/pulls/91/comments"
    },
    "review_comment": {
      "href": "https://api.github.com/repos/solid/mashlib/pulls/comments{/number}"
    },
    "commits": {
      "href": "https://api.github.com/repos/solid/mashlib/pulls/91/commits"
    },
    "statuses": {
      "href": "https://api.github.com/repos/solid/mashlib/statuses/c29ad227af3725c135d041d4415b2c90e67711dc"
    }
  },
  "author_association": "CONTRIBUTOR",
  "active_lock_reason": null,
  "merged": true,
  "mergeable": null,
  "rebaseable": null,
  "mergeable_state": "unknown",
  "merged_by": { range: 'user'},
  "comments": 0,
  "review_comments": 0,
  "maintainer_can_modify": false,
  "commits": 2,
  "additions": 281,
  "deletions": 68,
  "changed_files": 4
}

//////////////////////////////////////////
templates['repo'] = {
  "id": 58017436,
  "node_id": "MDEwOlJlcG9zaXRvcnk1ODAxNzQzNg==",
  "name": "mashlib",
  "full_name": "solid/mashlib",
  "private": false,
  "owner": { range: 'user' },
  "html_url": "https://github.com/solid/mashlib",
  "description": "Solid-compatible data mashup library and Data Browser",
  "fork": false,
  "url": "https://api.github.com/repos/solid/mashlib",
  "forks_url": "https://api.github.com/repos/solid/mashlib/forks",
  "keys_url": "https://api.github.com/repos/solid/mashlib/keys{/key_id}",
  "collaborators_url": "https://api.github.com/repos/solid/mashlib/collaborators{/collaborator}",
  "teams_url": "https://api.github.com/repos/solid/mashlib/teams",
  "hooks_url": "https://api.github.com/repos/solid/mashlib/hooks",
  "issue_events_url": "https://api.github.com/repos/solid/mashlib/issues/events{/number}",
  "events_url": "https://api.github.com/repos/solid/mashlib/events",
  "assignees_url": "https://api.github.com/repos/solid/mashlib/assignees{/user}",
  "branches_url": "https://api.github.com/repos/solid/mashlib/branches{/branch}",
  "tags_url": "https://api.github.com/repos/solid/mashlib/tags",
  "blobs_url": "https://api.github.com/repos/solid/mashlib/git/blobs{/sha}",
  "git_tags_url": "https://api.github.com/repos/solid/mashlib/git/tags{/sha}",
  "git_refs_url": "https://api.github.com/repos/solid/mashlib/git/refs{/sha}",
  "trees_url": "https://api.github.com/repos/solid/mashlib/git/trees{/sha}",
  "statuses_url": "https://api.github.com/repos/solid/mashlib/statuses/{sha}",
  "languages_url": "https://api.github.com/repos/solid/mashlib/languages",
  "stargazers_url": "https://api.github.com/repos/solid/mashlib/stargazers",
  "contributors_url": "https://api.github.com/repos/solid/mashlib/contributors",
  "subscribers_url": "https://api.github.com/repos/solid/mashlib/subscribers",
  "subscription_url": "https://api.github.com/repos/solid/mashlib/subscription",
  "commits_url": "https://api.github.com/repos/solid/mashlib/commits{/sha}",
  "git_commits_url": "https://api.github.com/repos/solid/mashlib/git/commits{/sha}",
  "comments_url": "https://api.github.com/repos/solid/mashlib/comments{/number}",
  "issue_comment_url": "https://api.github.com/repos/solid/mashlib/issues/comments{/number}",
  "contents_url": "https://api.github.com/repos/solid/mashlib/contents/{+path}",
  "compare_url": "https://api.github.com/repos/solid/mashlib/compare/{base}...{head}",
  "merges_url": "https://api.github.com/repos/solid/mashlib/merges",
  "archive_url": "https://api.github.com/repos/solid/mashlib/{archive_format}{/ref}",
  "downloads_url": "https://api.github.com/repos/solid/mashlib/downloads",
  "issues_url": "https://api.github.com/repos/solid/mashlib/issues{/number}",
  "pulls_url": "https://api.github.com/repos/solid/mashlib/pulls{/number}",
  "milestones_url": "https://api.github.com/repos/solid/mashlib/milestones{/number}",
  "notifications_url": "https://api.github.com/repos/solid/mashlib/notifications{?since,all,participating}",
  "labels_url": "https://api.github.com/repos/solid/mashlib/labels{/name}",
  "releases_url": "https://api.github.com/repos/solid/mashlib/releases{/id}",
  "deployments_url": "https://api.github.com/repos/solid/mashlib/deployments",
  "created_at": "2016-05-04T02:41:18Z",
  "updated_at": "2020-07-09T12:36:06Z",
  "pushed_at": "2020-07-09T11:56:57Z",
  "git_url": "git://github.com/solid/mashlib.git",
  "ssh_url": "git@github.com:solid/mashlib.git",
  "clone_url": "https://github.com/solid/mashlib.git",
  "svn_url": "https://github.com/solid/mashlib",
  "homepage": "https://solid.github.io/mashlib/dist/mashlib.min.js",
  "size": 56823,
  "stargazers_count": 49,
  "watchers_count": 49,
  "language": "CSS",
  "has_issues": true,
  "has_projects": true,
  "has_downloads": true,
  "has_wiki": true,
  "has_pages": true,
  "forks_count": 24,
  "mirror_url": null,
  "archived": false,
  "disabled": false,
  "open_issues_count": 23,
  "license": { range: 'license'  },
  "forks": 24,
  "open_issues": 23,
  "watchers": 49,
  "default_branch": "master"
}

templates['license'] = {
  "key": "mit",
  "name": "MIT License",
  "spdx_id": "MIT",
  "url": "https://api.github.com/licenses/mit",
  "node_id": "MDc6TGljZW5zZTEz"
}


///////////////////////////////////

async function loadGithubURI (githubURI) {
  console.log(`Fetching object at ${githubURI} `)
  var res
  try {
    res = await fetch(githubURI, fetchOptions)
  } catch (err) {
    console.error(` #### Fetch of  <${githubURI}>failed: ${err}\n`)
    return null
  }
  const text = await res.text()
  // console.log('Issue text: '  + text)
  const issue = JSON.parse(text)
  console.log(` Github object: `  + JSON.stringify(issue, null, 4))
  return issue
}

async function loadAndimportGithubObject (githubType, solidTask, githubURI) {

  const issue = await loadGithubURI (githubURI)
  if (!issue) return // @@ about?
  return await importGithubObject (issue, githubType, solidTask)
}

async function importGithubObject (issue, githubType, solidTask) {

  async function importNested (value, model) {
    if (!model.range) {
      throw new Error(`Error: Template '${githubType}' key ${key} has valueType "object" but no range`)
    }
    const githubTypeString = model.range
    if (typeof value === 'object') {
      if (!value.id) {
        console.error('   ### Ooops object has no id:' + JSON.stringify(value))
      }
      result = solidObjectFor(value, githubTypeString)
    } else {
      throw "should not be here"
      result = await solidObjectForGithubURI(value, githubTypeString)
    }
    console.log(`   new solid ${githubTypeString}: ${result}`)
    await importGithubObject(value, model.range, result)
    return
  }

  const template = templates[githubType]
  console.log(`\n Importing ${githubType} to Solid ${solidTask}`)
  // console.log('End of issue object. Issue.keys: ' + issue.keys)
  for (const [key, value] of Object.entries(issue)) {
    // console.log(`   looking at ${githubType} key ` + key)
    if (value === null) continue // null means no info
    var result = value
    const model = template[key]
    if (model === undefined) {
      const msg = ` #### Error: Template for "${githubType}" does not have key "${key}": { example: "${value}"}`
      console.error(msg)
      // throw new Error(msg)
      continue
    }
    if (!model.property) continue
    const doc = solidTask.doc()
    if (model.valueType === 'state') {
      result = value === 'closed' ? ns.wf('Closed') : ns.wf('Open')
      console.log('    State result: ' + result)
    } else if (model.valueType === 'agentType') {
      result = value === 'User' ? ns.vcard('Individual') :
               value === 'Organization'? ns.vcard('Organization') : GITHUB(value)
    } else if (model.valueType === 'string') {
      result = value
    } else if (model.valueType === 'node') {
      result = $rdf.sym(value)
    } else if (model.valueType === 'dateTime') {
      result = new $rdf.Literal(value, null, ns.xsd('dateTime'))
    } else if (model.valueType === 'object') {
      await importNested (result, model)
    } else if (model.valueType === 'array') {
      for (const item of value) {
        await importNested (item, model)
        console.log(`  Found in array for ${solidTask}: ${key} ->  ${model.property} ${result} @ ${doc}`)
        kb.add(solidTask, model.property, result, doc)
        toBePut[doc.uri] = true
      }
      continue
    }
    console.log(`  Found ${key} ->  ${model.property} ${result}`)
    kb.add(solidTask, model.property, result, doc)
    toBePut[doc.uri] = true
  }
}

/******************************* MAIN PROGRAM BODY
*/
async function go () {
  /*
  console.log('Getting orgs .')
  const orgs = await octokit.orgs.list()
  console.log('orgs: ' + orgs.length)
  */
  var owner = 'solid' // owner of project
  var org = 'solid'
  var repo = 'mashlib'

  const orgMembers = await getListing(octokit.orgs.listMembers, {org: owner})
  console.log(`orgMembers ${orgMembers.length}`)
  console.log(' Org members: ' + JSON.stringify(orgMembers, null, 4))

  // Make a SOlid group of the members of the org
  const orgMemberGroup = kb.sym(`${archiveBaseURI}${org}/Membership.ttl#group`)
  kb.add(orgMemberGroup, ns.rdf('type'), ns.vcard('Group'), orgMemberGroup.doc())
  kb.add(orgMemberGroup, ns.vcard('fn'), 'Members of ' + org, orgMemberGroup.doc())
  for (const member of orgMembers) {
    solidPerson = solidObjectFor(member, 'user')
    await importGithubObject(member, 'user', solidPerson)
    kb.add(orgMemberGroup, ns.vcard('hasMember'), solidPerson, orgMemberGroup.doc())
    if (member.login) {
      kb.add(solidPerson, ns.vcard('fn'), member.login, orgMemberGroup.doc())
    }
  }
  toBePut[orgMemberGroup.doc().uri] = true
  console.log(`${org} membership group ${orgMemberGroup.uri} has ${orgMembers.length} members`)


  const issues = await getListing(octokit.issues.listForRepo, {owner, repo})
  console.log(`issues ${issues.length}`)

  const orgProjects = await getListing(octokit.projects.listForOrg, {owner})
  console.log(`orgProjects ${orgProjects.length}`)

  const repoProjects = await getListing(octokit.projects.listForRepo, {owner, repo})
  console.log(`repoProjects ${repoProjects.length}`)

  for (var project of repoProjects) {
    console.log('\nProject: ' ) // + JSON.stringify(project, null, 4)
    const columns_url = project.columns_url
    const creator = project.creator

    const solidTracker = solidObjectFor(project, 'tracker')
    const doc = solidTracker.doc()
    kb.add(solidTracker, ns.rdf('type'), ns.wf('Tracker'), solidTracker.doc())
    kb.add(solidTracker, ns.dc('title'), "Tracker for github board", solidTracker.doc())
    kb.add(solidTracker, ns.wf('issueClass'), ns.wf('Task'), doc) // @@ say
    kb.add(solidTracker, ns.wf('assigneeGroup'), orgMemberGroup, doc)

    const stateStore = kb.sym(solidTracker.dir().uri + 'state.ttl')
    console.log('  stateStore ' + stateStore)
    kb.add(solidTracker, ns.wf('stateStore'), stateStore, solidTracker.doc())
    kb.add(solidTracker, ns.wf('stateStore'), stateStore, stateStore) // double

    kb.add(solidTracker, ns.wf('assigneeClass'), ns.foaf('Person'), solidTracker.doc()) // @@ set to people in the meeting?

    toBePut[stateStore.uri] = true
    toBePut[solidTracker.doc().uri] = true

    //  maybe don'yt have permissions.  Have to be org admin
    var colabs = []
    if (false) {
      try {
        const colabs = await octokit.paginate(octokit.projects.listCollaborators, {project_id: project.id})
      } catch (err) {
        console.error('listCollaborators: ' + err)
      }
    }

    console.log(`  Colaborators ${colabs.length}`)
    for (var co of colabs) {
       // const colab = await octokit.projects.getColumn({column_id: col.id})
       console.log('\n    Collaborator: ' + JSON.stringify(co, null, 4))
    }

    const solidClassification = solidObjectFor(project, 'project')
    kb.add(solidTracker, ns.wf('issueCategory'), solidClassification, solidClassification.doc())
    const columnList = new $rdf.Collection()
    kb.add(solidClassification, ns.owl('disjointUnionOf'), columnList, solidClassification.doc())

    await importGithubObject(project, 'project', solidClassification) // import from template

    const cols = await octokit.paginate(octokit.projects.listColumns, {project_id: project.id})
    console.log(`  Columns ${cols.length}`)
    for (var col of cols) {
       // Do Column
       const columnFetch = await octokit.projects.getColumn({column_id: col.id})
       const column = columnFetch.data
       const solidCategory = solidObjectFor(column, 'column')
       columnList.elements.push(solidCategory)

       console.log('\n  Column metadata: ' + JSON.stringify(column))
       kb.add(solidCategory, ns.rdfs('label'), column.name || '????', solidCategory.doc())

       kb.add(solidCategory, ns.rdfs('subClassOf'), solidClassification, solidClassification.doc())
       // kb.add(solidCategory, ns.rdfs('subClassOf'), ns.wf('Open'), solidClassification.doc()) // Make them all open so so they all show by default
       console.log('\n Column: ' + column.id) // JSON.stringify(column, null, 4))
       console.log(' column.id: ' + column.id)

       const cards = await octokit.paginate(octokit.projects.listCards, {column_id: column.id})
       for (var card of cards) {
         // Do card
         // console.log('\n  Card: '+ JSON.stringify(card, null, 4)) //
         const solidTask = solidObjectFor(card, 'card')
         const doc = solidTask.doc()
         kb.add(solidTask, ns.rdf('type'), ns.wf('Task'), stateStore)
         if (!card.state) { // Notes don't have an explicit state
           kb.add(solidTask, ns.rdf('type'), ns.wf('Open'), stateStore) // @@ map some columns to closed?
         }
         kb.add(solidTask, ns.rdf('type'), solidCategory, stateStore)
         kb.add(solidTask, ns.wf('tracker'), solidTracker, stateStore)

         await importGithubObject (card, 'card', solidTask)
         // await importGithubObject (card, 'issue', solidTask) // may have both or either shape

         if (card.assignee) {
           console.log('----->  Assignee: ' + JSON.stringify(card.assignee))
         }
         if (card.assignees && card.assignees.length > 0) {
           console.log('=====>  Assignees: ' + JSON.stringify(card.assignees))
         }

         if (card.note && !kb.any(solidTask, ns.dc('title'), null, stateStore)) {
           kb.add(solidTask, ns.dc('title'), card.note.slice(0, 80), stateStore)
           // kb.add(solidTask, ns.wf('description'), card.note, stateStore)
         } else if (card.content_url){ // Card is not a note it is an issue
             await loadAndimportGithubObject('issue', solidTask, card.content_url)
         } else {
           console.warn('\n @@ No note, so what to use as label for this?', JSON.stringify(card, null, 4))
         }
         toBePut[doc.uri] = true


         const Creator = card.creator
         // @@ person
       }
       console.log('Tracker at ' + solidTracker)

    }
  }

  await saveEverythingBack()


  //   try {} catch (err) {console.error('listForOrg: ' + err)}
  //   try {} catch (err) {console.error('listForOrg: ' + err)}
  //   try {} catch (err) {console.error('listForOrg: ' + err)}

  // await saveEverythingBack()
  console.log('ENDS')
  process.exit(0)

} // go

var toBePut = []
var peopleDone = {}
go()

// ends
