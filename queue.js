const queue = [];

module.exports = {
  addToQueue(track) {
    queue.push(track);
    console.log(`✅ Added to queue: ${track.title || "Unknown Title"}`);
    console.log(track);
  },

  removeFromQueue() {
    if (queue.length > 0) {
      return queue.shift();
    }
    return null;
  },

  getQueue() {
    return queue;
  },

  clearQueue() {
    queue.length = 0;
  },

  getCurrentTrack() {
    return queue.length > 0 ? queue[0] : null;
  },

  hasNextTrack() {
    return queue.length > 1;
  }
};
