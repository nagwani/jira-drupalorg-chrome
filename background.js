// background.js
import './utils.js';
let color = '#3aa757';
function getIssueIdFromUrl(url) {
    let parts = url.split('/');
    let lastPart = parts[parts.length - 1];
    parts = lastPart.split('#');
    return parts[0];
}

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.set({ color });
    console.log('Default background color set to %cgreen', `color: ${color}`);
});

chrome.tabs.onUpdated.addListener( function (tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete') {
    }
})

function findDrupalIssueId(issue) {
    let description = issue.fields.description;
    const regex = /https:\/\/www\.drupal\.org\/project\/.*\/issues\/\d*/g;
    let matches = description.match(regex);


    if (matches.length > 0) {
        let issueId;
        matches.forEach(function (match) {
            issueId = getIssueIdFromUrl(match);
        });
        return issueId;
    }
}

function parseIssueJson(text) {
    let decoded;
    try {
        decoded = JSON.parse(text);
    }
    catch (e) {
        let b = 'bb';
    }

  let issues = decoded.issues;
  let newIssues = [];
    issues.forEach(function (issue) {
        let newIssue = {};
        newIssue.url = `https://backlog.acquia.com/browse/${issue.key}`
        newIssue.key = issue.key;
        newIssue.assigned = issue.fields.assignee;
        newIssue.drupalIssueId = findDrupalIssueId(issue)
        newIssues.push(newIssue);
    })
    return newIssues;
}
chrome.runtime.onMessage.addListener(

    function(request, sender, sendResponse) {
        console.log(sender.tab ?
            "from a content script:" + sender.tab.url :
            "from the extension");
        if (request.call === "fetchIssue") {
            let url = "https://backlog.acquia.com/rest/api/2/search?jql="
            let searchFragments = [];
            request.issueIds.forEach(function (issueId){
                searchFragments.push(`description~%22issues/${issueId}%22`)
            });
            url += searchFragments.join(' or ');
            fetch(url)
                .then(response => response.text())
                .then(text => sendResponse({issues: parseIssueJson(text)}))
                //.then(price => sendResponse(price))
                .catch(error => sendResponse({farewell: error}));

            return true; // Will respond asynchronously.
            sendResponse({farewell: `id = ${request.issue_id}`});
        }

    }
);
