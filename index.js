var botkit = require('botkit');
var restify = require('restify');
var util = require('util');

if (!process.env.token) {
  console.log('Error: Specify Slack integration token in environment');
  process.exit(1);
}

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

var useridsToUsers = {}

function getRealName(user) {
  return useridsToUsers[user].real_name;
}

function getIDoneThisUserId(conversation) {
  conversation.ask("Can you tell me your iDoneThis userid, or type 'done' to quit?", [
    {
      pattern: 'done',
      callback: function(response, conversation) {
        conversation.say("Buh-bye!");
        conversation.next();
      }
    },

    {
      default: true,
        callback: function(response, conversation) {
          conversation.next();
          conversation.ask("So, your userid is " + response.text + ", is that correct?", [
            {
              pattern: bot.utterances.yes,
              callback: function(response, conversation) {
                conversation.next();
                conversation.say("Thank you, userid saved");
              }
            },
            {
              pattern: bot.utterances.no,
              callback: function(response, conversation) {
                conversation.next();
                conversation.say("Okay, let's try again");
                getIDoneThisUserId(conversation);
              }
            },
            {
              default: true,
                callback: function(response, conversation) {
                  conversation.next();
                  conversation.say("I'm sorry, I didn't understand your response, good-bye!");
                }
            }
          ]);
        }
    }
  ]);
}

var controller = botkit.slackbot();
var bot = controller.spawn(
  {
    token: process.env.token,
    json_file_store: 'botstore.json'
  }
);

bot.startRTM(function(err,bot,payload) {
  if (err) {
    console.log(err);
  } else {
    console.log("Connected to RTM");
    for (var i = 0; i < payload.users.length; ++i) {
      useridsToUsers[payload.users[i].id] = payload.users[i];
    }
  }
});

controller.hears('use idonethis', ['direct_message'], function(bot, message) {
  bot.startPrivateConversation(message, function(err, conversation) {
    conversation.say("Hello " + getRealName(message.user));
    getIDoneThisUserId(conversation);
  });
});

controller.hears('today (.*)', ['direct_message'], function(bot, message) {
  var matches = message.text.match(/today (.*)/i);
  var done = matches[1];
  console.log(done);
  bot.reply(message, 'Registered item done');
});

controller.hears('tomorrow (.*)', ['direct_message'], function(bot, message) {
  var matches = message.text.match(/tomorrow (.*)/i);
  var done = matches[1];
  console.log(done);
  bot.reply(message, 'Registered item to be done');
});

controller.hears('help', ['direct_message'], function(bot, message) {
  bot.reply(message, 'Available commands:\n'
            + '\t_today <single completed task>_ - add a task to your completed tasks\n'
            + '\t_tomorrow <single anticipated task>_ - add a task to your tasks to do tomorrow\n'
            + '\t_use idonethis_ - set up to retrieve task lists from iDoneThis.com\n'
            + '\t_help_ - this message');
});

controller.hears('.*', ['direct_message'], function(bot, message) {
  bot.reply(message, 'Sorry, you must begin your message with either "today" or "tomorrow"');
});

// var client = createIDoneThisClient();
//
// client.get('/api/v0.1/dones/?team=cosmos-data&done_date=yesterday', function(err, req, res, obj) {
//   if (err) {
//     console.log('err is: ', err);
//   }
//   values = parseResults(obj.results);
//   for (var person in values) {
//     console.log(standupString(person, values[person]));
//   }
// });
