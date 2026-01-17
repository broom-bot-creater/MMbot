// ==========================================
// Bot Name: MMBOT
// Developer: broom
// License: MIT
// ==========================================

require('dotenv').config(); // .env を読み込む
const { 
  Client, GatewayIntentBits, SlashCommandBuilder, ActionRowBuilder, 
  ButtonBuilder, ButtonStyle, EmbedBuilder, 
  PermissionFlagsBits, MessageFlags 
} = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

// トークンを環境変数から取得
const token = process.env.DISCORD_TOKEN;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ],
});

// ===== 設定エリア =====
const watchEmoji = '📺';
const SUPPORT_SERVER_URL = 'https://discord.gg/npSPqJcX';
const DEVELOPER_NAME = 'broom';

const dataFiles = { teamHistory: path.join(__dirname, 'team_history.json') };
const HISTORY_LIMIT = 5; 
const TEAM_GENERATION_ATTEMPTS = 10;

// ===== 共通フッター生成 =====
function getFooter() {
  return { text: `Developed by ${DEVELOPER_NAME} | Support: ${SUPPORT_SERVER_URL}` };
}

// ===== データ処理・チーム分けロジック =====
async function loadData(key) { try { return JSON.parse(await fs.readFile(dataFiles[key], 'utf8')); } catch { return []; } }
async function saveData(key, data) { await fs.writeFile(dataFiles[key], JSON.stringify(data, null, 2), 'utf8'); }

async function saveTeamHistory(newTeams) {
  let history = await loadData('teamHistory');
  history.unshift({ timestamp: new Date().toISOString(), teams: newTeams });
  if (history.length > HISTORY_LIMIT) history.length = HISTORY_LIMIT;
  await saveData('teamHistory', history);
}

function fisherYatesShuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function calculatePairScores(history) {
  const scores = new Map();
  history.forEach((entry, index) => {
    const weight = (HISTORY_LIMIT + 1 - index) * 2; 
    (entry.teams || []).forEach(team => {
      for (let i = 0; i < team.length; i++) {
        for (let j = i + 1; j < team.length; j++) {
          const pairKey = [team[i], team[j]].sort().join('-');
          scores.set(pairKey, (scores.get(pairKey) || 0) + weight);
        }
      }
    });
  });
  return scores;
}

async function createBalancedTeams(players, options) {
  const history = await loadData('teamHistory');
  const pairScores = calculatePairScores(history);
  const createTeams = (plist) => {
    let t = [];
    if (options.teamCount) {
      t = Array.from({ length: options.teamCount }, () => []);
      plist.forEach((p, i) => t[i % options.teamCount].push(p));
    } else {
      for (let i = 0; i < plist.length; i += options.teamSize) t.push(plist.slice(i, i + options.teamSize));
    }
    return t;
  };
  let bestTeams = [];
  let minScore = Infinity;
  for (let i = 0; i < TEAM_GENERATION_ATTEMPTS; i++) {
    const currentTeams = createTeams(fisherYatesShuffle(players));
    let currentScore = 0;
    currentTeams.forEach(team => {
      for (let i = 0; i < team.length; i++) {
        for (let j = i + 1; j < team.length; j++) {
          currentScore += pairScores.get([team[i], team[j]].sort().join('-')) || 0;
        }
      }
    });
    if (currentScore < minScore) { minScore = currentScore; bestTeams = currentTeams; }
    if (minScore === 0) break;
  }
  return bestTeams;
}

// ===== 各種パネルコンポーネント =====
function getTeamPanelRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('teamCount_2').setLabel('2チーム').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('teamCount_3').setLabel('3チーム').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('teamCount_4').setLabel('4チーム').setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('teamSize_2').setLabel('2人ずつ').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('teamSize_3').setLabel('3人ずつ').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('teamSize_4').setLabel('4人ずつ').setStyle(ButtonStyle.Success)
    )
  ];
}

function getWatchRow() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('watch_on').setLabel(`${watchEmoji} 観戦設定`).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('watch_off').setLabel('解除').setStyle(ButtonStyle.Secondary)
  )];
}

// ===== メイン処理 =====
client.on('ready', async () => {
  console.log(`${client.user.tag} (MMBOT) 起動完了`);
  client.user.setActivity('/help をチェック', { type: 0 });

  const commands = [
    new SlashCommandBuilder().setName('help').setDescription('MMBOTの使い方を表示します'),
    new SlashCommandBuilder().setName('setup').setDescription('チーム分けパネルを設置します').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  ];
  await client.application.commands.set(commands);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.guild) return;
  const { commandName, customId, member, channel } = interaction;

  if (interaction.isChatInputCommand()) {
    if (commandName === 'help') {
      const helpEmbed = new EmbedBuilder()
        .setTitle('🎮 MMBOT 使い方ガイド')
        .setDescription('チーム分けと観戦管理を自動化するボットです。')
        .addFields(
          { name: '`/setup`', value: '管理者専用：チーム分け・観戦設定パネルを設置します。' },
          { name: '📺 観戦設定', value: 'ボタンを押すと名前に 📺 が付き、チーム分けの対象から自動で除外されます。' },
          { name: '🆘 サポート', value: `不具合や要望は[サポートサーバー](${SUPPORT_SERVER_URL})までお寄せください。` }
        )
        .setColor(0x00FF00)
        .setFooter(getFooter());
      await interaction.reply({ embeds: [helpEmbed], flags: [MessageFlags.Ephemeral] });
    }
    
    if (commandName === 'setup') {
      const setupEmbed = new EmbedBuilder()
        .setTitle('🎮 チーム分け・観戦設定')
        .setDescription('下のボタンからチーム分けの実行や観戦モードの切り替えが可能です。')
        .setColor(0x5865F2)
        .setFooter(getFooter());
      await interaction.reply({ embeds: [setupEmbed], components: [...getTeamPanelRows(), ...getWatchRow()] });
    }
  }

  if (interaction.isButton()) {
    try {
      if (customId.startsWith('teamCount_') || customId.startsWith('teamSize_')) {
        if (!member.voice.channel) return interaction.reply({ content: 'VCに入ってください', flags: [MessageFlags.Ephemeral] });
        await interaction.deferUpdate();
        
        const membersInVC = member.voice.channel.members.filter(m => !m.user.bot && !m.displayName.startsWith(watchEmoji));
        if (membersInVC.size === 0) return;

        const [type, value] = customId.split('_');
        const num = parseInt(value);
        const teams = await createBalancedTeams([...membersInVC.values()].map(m => m.displayName), type === 'teamCount' ? { teamCount: num } : { teamSize: num });
        await saveTeamHistory(teams);
        
        const teamMessages = teams.map((t, i) => `**チーム ${i + 1}**: ${t.join('、')}`).join('\n\n');
        
        await interaction.editReply({ components: [] });
        await channel.send({ 
          content: `🎮 **チーム分け結果**`,
          embeds: [new EmbedBuilder().setDescription(teamMessages).setColor(0x00AAFF).setFooter(getFooter())],
          components: [...getTeamPanelRows(), ...getWatchRow()] 
        });
        return;
      }

      if (customId.startsWith('watch_')) {
        if (!member.voice.channel) return interaction.reply({ content: 'VCに入ってください', flags: [MessageFlags.Ephemeral] });
        let currentName = member.nickname || member.user.username;
        await interaction.deferUpdate();

        if (customId === 'watch_on' && !currentName.startsWith(watchEmoji)) {
          await member.setNickname(`${watchEmoji} ${currentName}`).catch(() => {});
        } else if (customId === 'watch_off' && currentName.startsWith(watchEmoji)) {
          await member.setNickname(currentName.replace(watchEmoji, '').trim()).catch(() => {});
        }
        return;
      }
    } catch (err) { console.error(err); }
  }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
  if (oldState.channel && !newState.channel) {
    const member = oldState.member;
    if (member && member.nickname?.startsWith(watchEmoji)) {
      await member.setNickname(member.nickname.replace(watchEmoji, '').trim()).catch(() => {});
    }
  }
});

client.login(token);