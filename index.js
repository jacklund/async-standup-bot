var restify = require('restify');
var util = require('util');

function createIDoneThisClient() {
  return restify.createJsonClient({
      url: 'https://idonethis.com',
      version: '*',
      headers: {
        "Authorization": "Token f83c8eb9efe4df88e7773ec7232b3ec641443bce"
      }
  });
}

function parseResults(results) {
  var values = {}
  for (var i = 0; i < results.length; ++i) {
    var result = results[i];
    if (!(result.owner in values)) {
      values[result.owner] = {'goals': [], 'dones': []}
    }
    if (result.is_goal) {
      values[result.owner]['goals'].push(result.raw_text);
    } else {
      values[result.owner]['dones'].push(result.raw_text);
    }
  }

  return values;
}

function formatList(list) {
  var string = "";
  if (list.length > 0) {
    for (var i = 0; i < list.length; ++i) {
      string += util.format("\t%d) %s\n", i, list[i]);
    }
  } else {
    string = "Nothing";
  }

  return string;
}

function standupString(person, values) {
  return util.format("Async standup for %s:\n"
                     + "Yesterday:\n"
                     + "%s"
                     + "Today:\n"
                     + "%s",
                     person, formatList(values.dones), formatList(values.goals));
}

var client = createIDoneThisClient();

client.get('/api/v0.1/dones/?team=cosmos-data&done_date=yesterday', function(err, req, res, obj) {
  if (err) {
    console.log('err is: ', err);
  }
  values = parseResults(obj.results);
  for (var person in values) {
    console.log(standupString(person, values[person]));
  }
});
