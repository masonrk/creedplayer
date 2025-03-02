const { Client, Constants, CommandInteraction } = require("oceanic.js")
const ytdl = require("ytdl-core")
const {
  joinVoiceChannel,
  createAudioResource,
  createAudioPlayer
} = require("@discordjs/voice")
const ytSearch = require("yt-search")


//Currently unused


class YTService {
  constructor() {
    this.audioPlayer = createAudioPlayer()
    this.queue = []
  }
  async joinVoice(interaction) {
    if (!this.voice) {
      const userChannel = interaction.member.voiceState
      this.voice = joinVoiceChannel({
        adapterCreator: interaction.guild.voiceAdapterCreator,
        channelId: userChannel.channelID,
        guildId: interaction.guildID
      })
      this.voice.subscribe(this.audioPlayer)
    }
    return this.voice
  }
  async addToQueue(interaction) {
    const songQuery = interaction.data.options.getString("query", true)
    try {
      await interaction.defer()

      const search = await ytSearch(songQuery)
      const searchRes = search.videos[0].url

      const ytdlProcess = ytdl(searchRes, { filter: "audioonly" })
      ytdlProcess.on("error", error => console.error(error))

      console.log(this.audioPlayer.state.status);
      if (this.audioPlayer.state.status === "playing") {
        console.log('adding to queue');
        this.queue.push(ytdlProcess)
        interaction.createFollowup({ content: `Added to queue ${searchRes}` })
        return this.runQueue()
      } else {
        console.log("Just straight playing");
        await this.joinVoice(interaction)
        this.audioPlayer.play(createAudioResource(ytdlProcess))
        return interaction.createFollowup({ content: `Played ${searchRes}` })
      }
    } catch (error) {
      console.error(error)
      return interaction.createFollowup({ content: "An error occured" })
    }
  }
  async runQueue() {
    for(const process of this.queue){
      this.audioPlayer.play(createAudioResource(process));
    }
  }
}
exports.YTService = YTService;