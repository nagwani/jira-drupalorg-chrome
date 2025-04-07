// background.js
import { utils } from "./common.js";
import { jiraConfig } from "./config.js";

function findDrupalIssueId(issue) {
  let description = issue.fields.description;
  const regex = /https:\/\/www\.drupal\.org\/project\/.*\/issues\/\d*/g;
  if (description) {
    let matches = description.match(regex);

    if (matches && matches.length > 0) {
      let issueId;
      matches.forEach(function (match) {
        issueId = utils.getIssueIdFromUrl(match);
      });
      return issueId;
    }
  }
}

function parseJiraIssuesJson(text) {
  let decoded;
  try {
    decoded = JSON.parse(text);
  } catch (e) {
    let b = "bb";
  }

  let issues = decoded.issues;
  let newIssues = [];
  issues.forEach(function (issue) {
    try {
      let newIssue = {};
      newIssue.url = `${jiraConfig.jira_base_url}browse/${issue.key}`;
      newIssue.id = issue.id;
      newIssue.key = issue.key;
      newIssue.assigned = issue.fields.assignee;
      newIssue.status = issue.fields.status.name;
      newIssue.sprint = "";
      if (jiraConfig.show_sprint_value) { 
        if (issue['fields'][jiraConfig.sprint_custom_field_id]) {
          newIssue.sprint = issue['fields'][jiraConfig.sprint_custom_field_id][0].name;
        }
      }
      const drupalId = findDrupalIssueId(issue);
      if (drupalId) {
        newIssue.drupalIssueId = drupalId;
        newIssue.drupalUrl = `https://www.drupal.org/i/${drupalId}`;

      }
      newIssues.push(newIssue);
    }
    catch (error) {
      console.error(error);
    }

  });
  return newIssues;
}
function fetchJson(url, parser, sendResponse) {
  fetch(url)
      .then((response) => response.text())
      .then((text) => sendResponse({ issues: parser(text) }))
      // @todo handle error.
      .catch((error) => sendResponse({ farewell: error }));
}
function combineDrupalJira(drupalOrgIssues, jiraIssues) {

  // @todo Dynamically request user via json.
  function getDrupalUserNameForUid(id) {
    switch (id) {
      case '3685163':
        return 'kunal.sachdev';
      case '205645':
        return 'phenaproxima';
      case '3685174':
        return 'yash.rode';
      case '240860':
        return 'tedbow';
      case '99777':
        return 'wim-leers';
      case '246492':
        return 'longwave';
      default:
        return 'Other';
    }
  }

  // @todo Dynamically get tags names but also store locally to avoid calls every time
  //   or add this config.js property.
  const knownTags = {
    "31228": 'Sprint',
    "192148": 'stable blocker',
    "345": "Needs tests",
  }
  return jiraIssues.map(jiraIssue => {
   if(jiraIssue.hasOwnProperty('drupalIssueId')) {
     drupalOrgIssues.every(drupalOrgIssue => {
       if (drupalOrgIssue.nid === jiraIssue.drupalIssueId) {
         jiraIssue.drupalOrgTags = [];
         // convert to text.
         jiraIssue.drupalStatus = utils.getStatusForId(drupalOrgIssue.field_issue_status);
         if (drupalOrgIssue.hasOwnProperty('field_issue_assigned') && drupalOrgIssue.field_issue_assigned.hasOwnProperty('id')) {
           jiraIssue.drupalUserName = getDrupalUserNameForUid(drupalOrgIssue.field_issue_assigned.id);
         }
         if (drupalOrgIssue.hasOwnProperty('taxonomy_vocabulary_9')) {

           drupalOrgIssue.taxonomy_vocabulary_9.forEach(function (tag) {
             if (knownTags.hasOwnProperty(tag.id)) {
               jiraIssue.drupalOrgTags.push(knownTags[tag.id]);
             }
           })
         }
         return false;
       }
       return true;
     })

   }
   return jiraIssue;
 });
}
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  console.log(
    sender.tab
      ? "from a content script:" + sender.tab.url
      : "from the extension"
  );
  let url = `${jiraConfig.jira_base_url}rest/api/2/search?jql=`;
  if (request.call === "fetchJIraIssuesByDrupalIds") {
    let searchFragments = [];
    request.issueIds.forEach(function (issueId) {
      searchFragments.push(`description~%22issues/${issueId}%22`);
    });
    url += searchFragments.join(" or ");
    fetch(url)
        .then((response) => response.text())
        .then((text) => parseJiraIssuesJson(text))
        .then((issues) => sendResponse({issues: issues}));

    return true; // Will respond asynchronously.
  }
  if (request.call === "fetchJIraIssuesByIds") {
    let searchFragments = [];
    request.ids.forEach(function (id) {
      searchFragments.push(`id=${id}`);
    });
    url += searchFragments.join(" or ");
    let jiraIssues;
    fetch(url)
        .then((response) => response.text())
        .then((text) => parseJiraIssuesJson(text))
        .then(issues => {
          jiraIssues = issues;
          return issues;
        })
        .then((issues) => Promise.all(
            issues.filter(
                issue => issue.hasOwnProperty('drupalIssueId')
            ).
            map(
                issue => fetch(`https://www.drupal.org/api-d7/node/${issue.drupalIssueId}.json`)
            )
        ))
        //.then((promises) => promises.map(promise => promise.then((response) => response.text())))
        .then(
            (promises) => Promise.all(promises.map(response => response.text()))
        )
        .then(drupalTexts => drupalTexts.map(drupalText => {
          try {
            return JSON.parse(drupalText);
          }
          catch (e) {
            return false;
          }
        }).filter(decoded => decoded !== false))
        .then(
            (drupalIssues => combineDrupalJira(drupalIssues, jiraIssues))
        )
        .then((issues) => sendResponse({issues: issues}));
    return true;
  }
});
