const { Client, Constants, CommandInteraction } = require("oceanic.js");
//const ytdl = require("@distube/ytdl-core");
const ytdl = require("yt-dlp-exec");
const { joinVoiceChannel, createAudioResource, createAudioPlayer } = require("@discordjs/voice");
const ytSearch = require("yt-search");
const { YTService } = require("./services/ytService");
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
  playlist: playlistCommand
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
//play functions
async function playNext(){
  console.log("Skipping forward");
  queue.shift();
  await sleep(2000);
  return await playQueue();
}

async function playQueue() {
  if (queue.length === 0) {
    console.log("🚫 Queue is empty, stopping playback.");
    return;
  }

  const currentTrack = queue[0]; // Store track reference safely

  if (!currentTrack?.url) {
    console.error("❌ Invalid track in queue, skipping...");
    queue.shift();
    return await playQueue();
  }

  try {
    let attempts = 0;
    let ytdlProcess;
    
    // Retry fetching track info up to 5 times before giving up
    while (attempts < 5) {
      try {
        ytdlProcess = await ytdl(currentTrack.url, {
          dumpSingleJson: true,
          format: 'bestaudio/best',
          extractAudio: true,
          preferFfmpeg: true,
          audioFormat: "best",
          audioQuality: 0
        });

        // Ensure metadata exists before proceeding
        if (ytdlProcess?.title && ytdlProcess?.requested_downloads?.[0]?.url) {
          break; // Success, exit loop
        }
      } catch (error) {
        console.warn(`🔄 Retry fetching track (${attempts + 1}/5)`);
        await sleep(1000); // Wait 1 sec before retrying
      }
      
      attempts++;
    }

    if (!ytdlProcess || !ytdlProcess?.requested_downloads?.[0]?.url) {
      console.error("❌ Failed to fetch track after retries.");
      queue.shift();
      return await playQueue();
    }

    // Update track title from ytdl metadata if missing
    if (!currentTrack.title) {
      currentTrack.title = ytdlProcess.title || "Unknown Title";
    }

    console.log(`🎵 Now playing: ${currentTrack.title}`);

    const audioResource = createAudioResource(ytdlProcess.requested_downloads[0].url);
    audioPlayer.play(audioResource);

    audioPlayer.once("idle", async () => {
      console.log("⏭️ Track finished, playing next...");
      queue.shift();
      await playQueue();
    });

    audioPlayer.on("error", error => {
      console.error("⚠️ Audio Player Error:", error);
    });

  } catch (error) {
    console.error("❌ Error playing queue:", error);
  }
}



async function holdingPattern(){
  audioPlayer.on('stateChange',async (oldState,newState) => {
    console.log(JSON.stringify(oldState.status));
    console.log(JSON.stringify(newState.status));
    if(newState.status === 'idle' && oldState.status === 'playing'){
      if(queue.length === 0){ //made this change while drunk. Don't know if it works. Want to remove the listener when queue done
        //audioPlayer.stop(); //maybe remove
        return;
      }
      await sleep(2000);
      await playNext();
    }
  });
  audioPlayer.on('error',(error) => {
    console.error(error);
  });
}

//interaction functions
async function playCommand(interaction){
  try {
    await interaction.defer();

    if(audioPlayer.state.status === 'paused'){ //Maybe add idle check for error case
      //on clear queue we skipped the next song up
      audioPlayer.unpause();
      return interaction.createFollowup({content: `Unpaused audio player`});
    }

    const songQuery = interaction.data.options.getString("query", true)
    const search = await ytSearch(songQuery)
    const searchRes = search.videos[0];

    queue.push(searchRes);
    if(audioPlayer.state.status === 'playing'){
        return interaction.createFollowup({ content: `Added to queue ${searchRes.url}` });
    } else {
      const userChannel = interaction.member.voiceState
      console.log(userChannel);
      const voice = joinVoiceChannel({
        adapterCreator: interaction.guild.voiceAdapterCreator,
        channelId: userChannel.channelID,
        guildId: interaction.guildID
      });
      voice.subscribe(audioPlayer);
      interaction.createFollowup({ content: `Played ${searchRes.url}` })
      await playQueue();
      return await holdingPattern();
    }
  } catch (error) {
    console.error(error);
    return interaction.createFollowup({content: "An error occured"});
  }
}

async function playlistCommand(interaction){
  try {
    await interaction.defer();

    const songQuery = interaction.data.options.getString("list", true)
    //const addToQueue = interaction.data.options.getString("add", true);
    //console.log(addToQueue);
    const input = {
      query: {
        listId: songQuery
      }
    };
    const search = await ytSearch(input);
    const searchRes = search.videos[0];
    for(const item of search.videos){
      console.log(item.title);
    }
    return interaction.createFollowup({content: "Testing"});
  } catch (error) {
    console.error(error);
    return interaction.createFollowup({content: "An error occured"});
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

async function clearCommand(interaction){
  try {
    await interaction.defer();
    const current = queue[0];
    queue = [current];
    return interaction.createFollowup({content: `Queue cleared`});
  } catch (error){
    console.error(error);
    return interaction.createFollowup({content: "An error occured"});
  }
}

async function skipCommand(interaction) {
  try {
    await interaction.defer();

    if (queue.length > 1) {
      console.log("⏭️ Skipping to next track...");
      audioPlayer.stop(true);
    } else {
      console.log("🚫 No more tracks in queue. Stopping playback.");
      audioPlayer.stop();
      queue = [];
    }

    return interaction.createFollowup({ content: `⏭️ Skipped track` });
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

async function queueCommand(interaction){
  try{
    await interaction.defer();
    let list = "";
    queue.forEach((item,index) => {
      list = list + (index + 1).toString() + `.) ${item.title}` + "\n";
    });
    return interaction.createFollowup({content: list});
  } catch (error){
    console.error(error);
    return interaction.createFollowup({content: "An error occured"});
  }
}

//this line must be at the very end
client.connect();