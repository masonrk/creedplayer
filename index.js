const { Client, Constants, CommandInteraction } = require("oceanic.js");
const { joinVoiceChannel, createAudioResource, createAudioPlayer, AudioPlayerStatus } = require("@discordjs/voice");
const ytSearch = require("yt-search");
const { Worker } = require("worker_threads");
const path = require("path");
const queueManager = require("./queue.js"); 
require('dotenv').config();

const ffmpeg = require("ffmpeg-static");
process.env.FFMPEG_PATH = ffmpeg;

const token = 'Bot ' + process.env.CLIENT_TOKEN;
const guildId =  process.env.GUILD_ID_TT;

let queue = [];
const audioPlayer = createAudioPlayer();
const client = new Client({
  intents: Constants.Intents.GUILD_VOICE_STATES,
  auth: token
});

const sleep = (delay) => new Promise((resolve) => setTimeout(resolve,delay));

client.on("ready", async () => {
  console.log(`Logged in as ${client.user.tag}!`);
    try {
      await client.application.bulkEditGuildCommands(guildId,
        [
          {
            name: "play",
            description: "play song from youtube",
            type: Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
              {
                name: "query",
                description: "Youtube video title",
                type: Constants.ApplicationCommandOptionTypes.STRING,
                required: false
              }
            ]
          },
          {
            name: "playlist",
            description: "Play a playlist from youtube",
            type: Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
              {
                name: "list",
                description: "List ID for playlist",
                type: Constants.ApplicationCommandOptionTypes.STRING,
                required: false
              }
            ]
          },
          {
            name: "check",
            description: "check state",
            type: Constants.ApplicationCommandTypes.CHAT_INPUT
          },
          {
            name: "clear",
            description: "clear the queue",
            type: Constants.ApplicationCommandTypes.CHAT_INPUT
          },
          {
            name: "skip",
            description: "skip track",
            type: Constants.ApplicationCommandTypes.CHAT_INPUT
          },
          {
            name: "pause",
            description: "pause player",
            type: Constants.ApplicationCommandTypes.CHAT_INPUT
          },
          {
            name: "stop",
            description: "Clear queue and stop player",
            type: Constants.ApplicationCommandTypes.CHAT_INPUT
          },
          {
            name: "commands",
            description: "Show all commands",
            type: Constants.ApplicationCommandTypes.CHAT_INPUT
          },
          {
            name: "queue",
            description: "Display the current queue",
            type: Constants.ApplicationCommandTypes.CHAT_INPUT
          }
        ]
      )
    } catch(error) {
      return console.error(error);
    }
    console.log("Bot ready");
});

const commandMap = {
  play: playCommand,
  check: checkCommand,
  clear: clearCommand,
  skip: skipCommand,
  pause: pauseCommand,
  stop: stopCommand,
  commands: commandsCommand,
  queue: queueCommand,
};

client.on("interactionCreate", async (interaction) => {
  if (interaction instanceof CommandInteraction) {
    const command = commandMap[interaction.data.name];
    if (command) {
      await command(interaction);
    } else {
      console.log(`⚠️ Unknown command: ${interaction.data.name}`);
    }
  } else {
    console.log(JSON.stringify(interaction));
  }
});

async function playQueue() {
  const currentTrack = queueManager.getCurrentTrack();

  if (!currentTrack) {
    console.log("🚫 Queue is empty, stopping playback.");
    return;
  }

  console.log(`🔍 Fetching: ${currentTrack.url} using Worker Thread`);

  return new Promise((resolve) => {
    const worker = new Worker(path.join(__dirname, "ytdlWorker.js"));
    worker.postMessage(currentTrack.url);

    worker.on("message", async (data) => {
      if (data.success) {
        currentTrack.title = data.title || "Unknown Title";
        console.log(`🎵 Now playing: ${currentTrack.title}`);

        try {
            // Remove existing listeners to avoid duplicate events
            audioPlayer.removeAllListeners(AudioPlayerStatus.Idle);

            const audioResource = createAudioResource(data.url);
            audioPlayer.play(audioResource);

        

          // Handle track completion properly
          audioPlayer.on(AudioPlayerStatus.Idle, () => {
            console.log("⏭️ Track finished, playing next...");
            queueManager.removeFromQueue();
            playQueue(); // Play the next track
          });

        } catch (error) {
          console.error("❌ Error creating audio resource:", error);
          queueManager.removeFromQueue();
          playQueue();
        }
      } else {
        console.error("❌ Worker Thread Error:", data.error);
        queueManager.removeFromQueue();
        playQueue();
      }

      worker.terminate();
    });

    worker.on("error", (error) => {
      console.error("⚠️ Worker Thread Error:", error);
      worker.terminate();
      queueManager.removeFromQueue();
      playQueue();
    });
  });
}


//interaction functions
async function playCommand(interaction) {
  try {
    await interaction.defer();

    if (audioPlayer.state.status === 'paused') {
      audioPlayer.unpause();
      return interaction.createFollowup({ content: `Unpaused audio player` });
    }

    const songQuery = interaction.data.options.getString("query", true);
    const search = await ytSearch(songQuery);
    const searchRes = search.videos[0];

    if (!searchRes) {
      return interaction.createFollowup({ content: "⚠️ No results found!" });
    }

    queueManager.addToQueue(searchRes);

    if (audioPlayer.state.status === 'playing') {
      return interaction.createFollowup({ content: `🔹 Added to queue: ${searchRes.title}` });
    } else {
      const userChannel = interaction.member.voiceState;
      const voice = joinVoiceChannel({
        adapterCreator: interaction.guild.voiceAdapterCreator,
        channelId: userChannel.channelID,
        guildId: interaction.guildID
      });
      voice.subscribe(audioPlayer);
      interaction.createFollowup({ content: `🎵 Now playing: ${searchRes.title}` });
      await playQueue();
    }
  } catch (error) {
    console.error(error);
    return interaction.createFollowup({ content: "⚠️ An error occurred" });
  }
}

async function checkCommand(interaction){
  try{
    await interaction.defer();
    console.log(audioPlayer.state.status);
    return interaction.createFollowup({content: `state is: ${audioPlayer.state.status}`});
  } catch (error){
    console.error(error);
    return interaction.createFollowup({content: "An error occured"});
  }
}

async function clearCommand(interaction) {
  try {
    await interaction.defer();
    queueManager.clearQueue();
    return interaction.createFollowup({ content: `🚮 Queue cleared` });
  } catch (error) {
    console.error(error);
    return interaction.createFollowup({ content: "⚠️ An error occurred" });
  }
}

async function skipCommand(interaction) {
  try {
    await interaction.defer();

    if (queueManager.hasNextTrack()) {
      console.log("⏭️ Skipping to next track...");
      audioPlayer.stop(); // Stop current song
      queueManager.removeFromQueue(); // Remove the current song
      await playQueue(); // Play the next song
    } else {
      console.log("🚫 No more tracks in queue. Stopping playback.");
      audioPlayer.stop();
      queueManager.clearQueue();
    }

    return interaction.createFollowup({ content: `⏭️ Skipped to the next track` });
  } catch (error) {
    console.error("❌ Skip Command Error:", error);
    return interaction.createFollowup({ content: "⚠️ An error occurred while skipping the track." });
  }
}



async function pauseCommand(interaction){
  try{
    await interaction.defer()
    audioPlayer.pause();
    return interaction.createFollowup({content: `Paused audio player`});
  } catch (error){
    console.error(error);
    return interaction.createFollowup({content: "An error occured"});
  }
}

async function stopCommand(interaction){
  try{
    await interaction.defer()
    queue = [];
    audioPlayer.stop();
    return interaction.createFollowup({content: `Cleared queue and stopped audio player`});
  } catch (error){
    console.error(error);
    return interaction.createFollowup({content: "An error occured"});
  }  
}

async function commandsCommand(interaction){
  try{
    await interaction.defer()
    return interaction.createFollowup({content: "/play query\n\tPlay a new song when query included. Unpause if not.\n/skip\n\tSkip the current track.\n/pause\n\tPause the audio player.\n/stop\n\tClear the queue and stop the audio player.\n/clear\n\tClear the queue.\n/check\n\tCheck status of audio player.\n/playlist\n\tDont use cause it dont work.\n"});
  } catch (error){
    console.error(error);
    return interaction.createFollowup({content: "An error occured"});
  }
}

async function queueCommand(interaction) {
  try {
    await interaction.defer();
    const queue = queueManager.getQueue();

    if (queue.length === 0) {
      return interaction.createFollowup({ content: "🚫 The queue is empty!" });
    }

    let list = queue.map((item, index) => `${index + 1}.) ${item.title}`).join("\n");
    return interaction.createFollowup({ content: `📜 **Current Queue:**\n${list}` });
  } catch (error) {
    console.error(error);
    return interaction.createFollowup({ content: "⚠️ An error occurred" });
  }
}


//this line must be at the very end
client.connect();