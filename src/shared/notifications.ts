/** Fork: finished-generation alert settings as the renderer sees them (never the bot token). */
export interface NotificationSettings {
  windows: boolean
  telegram: {
    enabled: boolean
    /** A bot token is saved. */
    connected: boolean
    botName: string
    /** The user's chat with the bot was found. */
    chatFound: boolean
    chatName: string
  }
}
