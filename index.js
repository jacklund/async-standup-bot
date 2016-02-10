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

var controller = botkit.slackbot();
var bot = controller.spawn(
  {
    token: process.env.slack_token,
    json_file_store: 'botstore.json'
  }
);

var channels = {}

bot.startRTM(function(err,bot,payload) {
  if (err) {
    console.log(err);
  } else {
    for (var i = 0; i < payload.users.length; ++i) {
      useridsToUsers[payload.users[i].id] = payload.users[i];
    }
    for (var i = 0; i < payload.channels.length; ++i) {
      channels[payload.channels[i].name] = payload.channels[i];
    }
    console.log("Connected to RTM");
  }
});

function verifyOrExit(prompt, valueName, conversation, cback, verify) {
  conversation.ask(prompt + " [" + valueName + ", or 'done' to cancel]", function(response, conversation) {
    if (response.text == 'done') {
      conversation.say("Cancelled. Buh-bye!");
      conversation.next();
    } else {
      conversation.next();
      value = response.text;
      conversation.ask("You said, '" + response.text + "', correct?", [
        {
          pattern: bot.utterances.yes,
          callback: function(response, conversation) {
            conversation.next();
            if (verify) {
              verify(value, cback);
            } else {
              cback(value);
            }
          }
        },

        {
          pattern: bot.utterances.no,
          callback: function(response, conversation) {
            conversation.say("Okay, let's try again");
            verifyOrExit(prompt, valueName, conversation, cback);
          }
        },

        {
          pattern: "done(.*)",
          callback: function(response, conversation) {
            conversation.say("Cancelled. Buh-bye!");
            conversation.next();
            cback(undefined);
          }
        },

        {
          default: true,
          callback: function(response, conversation) {
            conversation.say("I'm sorry, I didn't understand your response.");
            conversation.next();
            verifyOrExit(prompt, valueName, conversation, cback);
          }
        }
      ]);
    }
  });
}

function setChannelForUser(user, channel) {
  console.log(channel);
}

function setupChannel(bot, message, conversation) {
  verifyOrExit("What channel would you like your standup posted to?",
               "channel-name",
               conversation,
               function(channel) {
                 if (channel) {
                   setChannelForUser(message.user, channel);
                   setupIDoneThis(bot, message, conversation);
                 } else {
                   setupChannel(bot, message, conversation);
                 }
               },
              function(value, callback) {
                if (value in channels) {
                  callback(channels[value]);
                } else {
                  conversation.say("I'm sorry, that's not a valid channel name");
                  callback(undefined);
                }
              });
}

function setIDoneThisId(user, id) {
  console.log(id);
}

function printUsage(bot, message, conversation) {
  conversation.say("Alright, you're all set up\n"
                   + "To add new completed tasks, DM me '_today task_', e.g., 'today I completed X'\n"
                   + "For upcoming tasks, DM me '_tomorrow task_'\n"
                   + "If you're an iDoneThis user, I'll take the tasks from there as well");
}

function setupIDoneThis(bot, message, conversation) {
  conversation.ask("Are you an iDoneThis.com user, and would you like to use it for your standup tasks?", [
    {
      pattern: bot.utterances.yes,
      callback: function(response, conversation) {
        conversation.next();
        verifyOrExit("What is your iDoneThis userid?",
                     "userid",
                     conversation,
                     function(value) {
                       setIDoneThisId(message.user, value);
                       printUsage(bot, message, conversation);
                     });
      }
    },

    {
      pattern: bot.utterances.no,
      callback: function(response, conversation) {
        printUsage(bot, message, conversation);
      }
    },

    {
      default: true,
      callback: function(response, conversation) {
        conversation.next();
        conversation.say("I'm sorry, I don't understand your response");
        setupIDoneThis(bot, message, conversation);
      }
    }
  ]);
}

function doSetup(bot, message) {
  bot.startPrivateConversation(message, function(err, conversation) {
    conversation.say("Hello " + getRealName(message.user));
    setupChannel(bot, message, conversation);
  });
}

function initializeUser() {
  return {
        id: message.user,
        today: [],
        tomorrow: []
      }
}

function doToday(bot, message) {
  var matches = message.text.match(/today (.*)/i);
  var done = matches[1];
  controller.storage.users.get(message.user, function(err, user) {
    if (!user) {
      user = initializeUser();
    }
    user.today.push(done);
    controller.storage.users.save(user, function(err, id) {
      bot.reply(message, 'Registered item done');
    });
  });
}

function doTomorrow(bot, message) {
  var matches = message.text.match(/tomorrow (.*)/i);
  var done = matches[1];
  controller.storage.users.get(message.user, function(err, user) {
    if (!user) {
      user = initializeUser();
    }
    user.tomorrow.push(done);
    controller.storage.users.save(user, function(err, id) {
      bot.reply(message, 'Registered item to be done');
    });
  });
}

helpString = "Available commands:\n";

function doHelp(bot, message) {
  bot.reply(message, helpString);
}

commands = {
  'setup': {
    callback: doSetup,
    usage: 'setup',
    description: 'Set up user'
  },

  'today (.*)': {
    callback: doToday,
    usage: 'today <single completed task>',
    description: 'add a task to your completed tasks'
  },

  'tomorrow (.*)': {
    callback: doTomorrow,
    usage: 'tomorrow <single anticipated task>',
    description: 'add a task to your tasks to be done tomorrow',
  },

  'help': {
    callback: doHelp,
    usage: 'help',
    description: 'this message'
  }
}

for (command in commands) {
  controller.hears(command, ['direct_message'], commands[command].callback);
  helpString += '\t_' + commands[command].usage + '_ - ' + commands[command].description + '\n';
}

controller.hears('.*', ['direct_message'], function(bot, message) {
  bot.reply(message, "Sorry, I don't understand '" + message.text + "'");
  doHelp(bot, message);
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
