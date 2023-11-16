import Vue from 'vue';
import Vuex from 'vuex';
import imagePath from './imagePath.json';

Vue.use(Vuex);

export default new Vuex.Store({
  state: {
    /* data selection variables */
    match: null,
    requests: [],
    selectedRequest: null,
    positions: [],
    selectedPositions: [],
    diceSelectionRule: {},
    selectedDice: [],
    commandString: '',
    selectedObject: null,
    damageNotify: null,
    deck: [],
    deckModifyCounter: 0,
    showDeckDiv: false,
    serverURL: 'http://localhost:8000',
    serverConnected: false,

    // when imagePath is updated, it will be sorted by nameToId. Initially,
    // order of imagePath is same as file, so need to call update function
    // once app is loaded.
    imagePath: imagePath,
    nameToId: {},
    availableVersions: [],
  },
  mutations: {
    updateImagePath(state) {
      let new_dict = {};
      let keys = Object.keys(state.imagePath);
      keys.sort((a, b) => {
        a = a.split('/')[1];
        b = b.split('/')[1];
        let a_id = state.nameToId[a];
        let b_id = state.nameToId[b];
        if (a_id == undefined) a_id = 999999;
        if (b_id == undefined) b_id = 999999;
        return a_id - b_id;
      });
      for (let i = 0; i < keys.length; i++) {
        new_dict[keys[i]] = state.imagePath[keys[i]];
      }
      state.imagePath = new_dict;
    },
    updateDataByPatch(state, patch) {
      `patch format. update imagePath, nameToId and availableVersions
      {
          "version": "1.0",
          "patch": {
              "BACKEND_FULL_KEY": {
                  // all are optional. e.g. balance change cards will only have descs
                  // of newest version.
                  "imagepath": "new/path",
                  "id": 123456,
                  "names": {
                      "zh-CN": "new name",
                      "en-US": "new name"
                  },
                  "descs": {
                      "DESC_VERSION": {
                          "zh-CN": "new desc",
                          "en-US": "new desc"
                      }
                  }
              }
          }
      }
      `
      let patch_version = patch.version;
      if (patch_version != '1.0') throw 'Patch version not supported';
      let patch_data = patch.patch;
      let new_imagePath = JSON.parse(JSON.stringify(state.imagePath));
      let new_nameToId = JSON.parse(JSON.stringify(state.nameToId));
      let new_availableVersions = JSON.parse(JSON.stringify(state.availableVersions));
      for (let full_key in patch_data) {
        let data = patch_data[full_key];
        if (data.image_path) {
          new_imagePath[full_key] = data.image_path;
        }
        if (data.id) {
          new_nameToId[full_key.split('/')[1]] = data.id;
        }
        if (data.descs) {
          for (let version in data.descs)
            if (new_availableVersions.indexOf(version) == -1) {
              new_availableVersions.push(version);
            }
        }
      }
      new_availableVersions.sort();
      state.imagePath = new_imagePath;
      state.nameToId = new_nameToId;
      state.availableVersions = new_availableVersions;
      console.log('updateDataByPatch', state.imagePath, state.nameToId, state.availableVersions)
      this.commit('updateImagePath');
    },
    setSelectedObject(state, obj) {
      state.selectedObject = obj;
    },
    setMatch(state, data) {
      // when new match set, clear selected and update requests
      // if player_idx is set, requests with this player_idx will be filtered.
      // otherwise, filter with player idx with request 0.
      let match = data.match
      let player_idx = data.player_idx
      if (player_idx == null && match.requests.length > 0) player_idx = match.requests[0].player_idx
      state.match = match;
      state.requests = match.requests.filter((r) => {
        return r.player_idx == player_idx
      })
      for (let i = 0; i < state.requests.length; i++)
        state.requests[i].idx = i;
      let request = null;
      if (state.requests.length == 1) {
        request = 0;
      }
      this.commit('selectRequest', request);
    },
    selectRequest(state, request_idx) {
      // when a request selected, update positions
      state.selectedRequest = request_idx;
      state.positions = [];
      state.selectedPositions = [];
      this.commit('updateCost', { mode: 'none' });
      state.commandString = '';
      if (request_idx === null) {
        return
      }
      let request = state.requests[request_idx];
      let player_idx = request.player_idx;
      let table = state.match.player_tables[player_idx];
      if (request.name == 'SwitchCardRequest') {
        // all hand cards are valid positions
        let hands = table.hands
        for (let i = 0; i < hands.length; i++) {
          state.positions.push(hands[i].position)
        }
      }
      else if (request.name == 'ChooseCharactorRequest') {
        // all charactors listed in available_charactor_idxs are valid positions
        let charactors = table.charactors
        for (let i = 0; i < request.available_charactor_idxs.length; i++) {
          state.positions.push(charactors[request.available_charactor_idxs[i]].position)
        }
      }
      else if (request.name == 'RerollDiceRequest') {
        // all dice are available, no other positions
        this.commit('updateCost', { mode: 'any', player: player_idx })
      }
      else if (request.name == 'SwitchCharactorRequest') {
        // charactors listed in candidate_charactor_idxs are valid positions
        let charactors = table.charactors
        state.positions.push(charactors[request.target_charactor_idx].position)
        state.selectedPositions.push(0);
      }
      else if (request.name == 'ElementalTuningRequest') {
        // all hand cards are valid positions
        let hands = table.hands
        for (let i = 0; i < hands.length; i++) {
          state.positions.push(hands[i].position)
        }
        this.commit('updateCost', { mode: 'tune', player: player_idx })
      }
      else if (request.name == 'DeclareRoundEndRequest') {
        // no other positions
      }
      else if (request.name == 'UseSkillRequest') {
        // no other positions

        // opponent active charactor as position
        // let o_table = state.match.player_tables[1 - player_idx]
        // let o_charactors = o_table.charactors
        // let active = o_table.active_charactor_idx
        // state.positions.push(o_charactors[active].position)
        // state.selectedPositions = [0]
      }
      else if (request.name == 'UseCardRequest') {
        // get target positions from request directly
        state.positions = request.targets
      }
      if (state.positions.length == 1) state.selectedPositions = [0];
      if (request.cost != undefined) {
        // has cost, update dice selection
        this.commit('updateCost',  { mode: 'cost', player: player_idx, cost: request.cost })
      }
      this.commit('updateCommandString');
    },
    updateCost(state, rule) {
      state.diceSelectionRule = rule;
      state.selectedDice = [];
    },
    diceClick(state, data) {
      data = { idx: data };
      if (state.diceSelectionRule.mode == 'none') {
        return
      }
      let table = state.match.player_tables[state.diceSelectionRule.player]
      if (state.diceSelectionRule.mode == 'any') {
        // if in selected, remove; if not, add
        let idx = state.selectedDice.indexOf(data.idx)
        if (idx == -1) {
          state.selectedDice.push(data.idx)
        }
        else {
          state.selectedDice.splice(idx, 1)
        }
      }
      else if (state.diceSelectionRule.mode == 'tune') {
        let valid = state.requests[state.selectedRequest].dice_idxs;
        if (valid.indexOf(data.idx) == -1) return;
        // can only select one die with different element as active charactor
        // let active = table.active_charactor_idx
        // let element = table.charactors[active].element
        // let dice_color = table.dice.colors[data.idx]
        // // console.log(element, dice_color)
        // if (dice_color == element || dice_color == 'OMNI') {
        //   return
        // }
        // keep only one die
        state.selectedDice = [data.idx]
      }
      else if (state.diceSelectionRule.mode == 'cost') {
        function costValidCheck(cost, color, selected) {
          // based on cost, check current selected with color is valid
          let total = cost.any_dice_number + cost.same_dice_number + cost.elemental_dice_number
          // select number should not exceed total
          if (selected.length > total) return false;
          if (cost.same_dice_number > 0) {
            // for same, ignore OMNI should only contain one color
            let selected_color = null;
            for (let i = 0; i < selected.length; i++) {
              let c = color[selected[i]]
              if (c == 'OMNI') continue;
              if (selected_color != null && selected_color != c) return false;
              selected_color = c;
            }
            return true;
          }
          let ele_number = cost.elemental_dice_number;
          let filtered = 0;
          for (let i = 0; i < selected.length; i++) {
            // fulfill elemental dice number first
            let c = color[selected[i]]
            if (ele_number > 0 && (c == 'OMNI' || c == cost.elemental_dice_color)) {
              ele_number -= 1;
            }
            else {
              filtered++;
            }
          }
          // other number should smaller than any
          return filtered <= cost.any_dice_number;
        }
        let idx = state.selectedDice.indexOf(data.idx)
        if (idx != -1) {
          // if is selected, remove and return
          state.selectedDice.splice(idx, 1);
        }
        else {
          // otherwise, check if valid
          state.selectedDice.push(data.idx);
          if (!costValidCheck(state.diceSelectionRule.cost, table.dice.colors, state.selectedDice)) {
            state.selectedDice = [data.idx];
            if (!costValidCheck(state.diceSelectionRule.cost, table.dice.colors, state.selectedDice)) {
              state.selectedDice = [];
            }
          }
        }
      }
      this.commit('updateCommandString');
    },
    positionClick(state, position_idx) {
      // console.log(position_idx, state.selectedPositions)
      if (state.selectedRequest == null) return;
      if (position_idx == null || position_idx == -1) return;
      let select_idx = state.selectedPositions.indexOf(position_idx);
      if (state.requests[state.selectedRequest].name == 'SwitchCardRequest') {
        // only this request can select multiple positions
        if (select_idx == -1) {
          state.selectedPositions.push(position_idx)
        }
        else {
          state.selectedPositions.splice(select_idx, 1)
        }
      }
      else {
        // other request can only select one position
        state.selectedPositions = [position_idx]
      }
      // console.log(position_idx, state.selectedPositions)
      this.commit('updateCommandString');
    },
    updateCommandString(state) {
      state.commandString = '';
      if (state.selectedRequest == null) return;
      if (state.diceSelectionRule.mode != 'none'
        && state.diceSelectionRule.mode != 'any') {
          // need dice number right
          let cost = state.diceSelectionRule.cost;
          let total = 1;
          if (state.diceSelectionRule.mode != 'tune')
            total = cost.any_dice_number + cost.same_dice_number + cost.elemental_dice_number
          // select number should not exceed total
          if (state.selectedDice.length != total) return;
        }
      let request = state.requests[state.selectedRequest];
      let res = {
        'SwitchCardRequest': 'sw_card',
        'ChooseCharactorRequest': 'choose',
        'RerollDiceRequest': 'reroll',
        'SwitchCharactorRequest': 'sw_char',
        'ElementalTuningRequest': 'tune',
        'DeclareRoundEndRequest': 'end',
        'UseSkillRequest': 'skill',
        'UseCardRequest': 'card',
      }[request.name] + ' ';
      if (res == 'sw_card ') {
        for (let i = 0; i < state.selectedPositions.length; i++) {
          let position = state.positions[state.selectedPositions[i]];
          let hands = state.match.player_tables[request.player_idx].hands;
          for (let j = 0; j < hands.length; j++) {
            if (hands[j].position.id == position.id) {
              res += j + ' ';
              break;
            }
          }
        }
      }
      else if (res == 'choose ') {
        if (state.selectedPositions.length != 1) return;
        let position = state.positions[state.selectedPositions[0]];
        let charactors = state.match.player_tables[request.player_idx].charactors;
        for (let j = 0; j < charactors.length; j++) {
          if (charactors[j].position.id == position.id) {
            res += j + ' ';
            break;
          }
        }
      }
      else if (res == 'reroll ') {
        res += state.selectedDice.join(' ') + ' ';
      }
      else if (res == 'sw_char ') {
        if (state.selectedPositions.length != 1) return;
        let position = state.positions[state.selectedPositions[0]];
        let charactors = state.match.player_tables[request.player_idx].charactors;
        for (let j = 0; j < charactors.length; j++) {
          if (charactors[j].position.id == position.id) {
            res += j + ' ';
            break;
          }
        }
        res += state.selectedDice.join(' ') + ' ';
      }
      else if (res == 'tune ') {
        if (state.selectedPositions.length != 1) return;
        let position = state.positions[state.selectedPositions[0]];
        let hands = state.match.player_tables[request.player_idx].hands;
        for (let j = 0; j < hands.length; j++) {
          if (hands[j].position.id == position.id) {
            res += j + ' ';
            break;
          }
        }
        res += state.selectedDice.join(' ') + ' ';
      }
      else if (res == 'end ') {
        // no other positions
      }
      else if (res == 'skill ') {
        res += request.skill_idx + ' ';
        res += state.selectedDice.join(' ') + ' ';
      }
      else if (res == 'card ') {
        res += request.card_idx + ' ';
        if (state.selectedPositions.length > 1) return;
        if (state.selectedPositions.length == 0 && state.positions.length > 0) return;
        if (state.selectedPositions.length == 1) {
          let position = state.positions[state.selectedPositions[0]];
          if (position.positions) {
            // multiple position selection
            res += state.selectedPositions[0] + ' ';
          }
          else for (let i = 0; i < request.targets.length; i++) {
            if (request.targets[i].id == position.id) {
              res += i + ' ';
              break;
            }
          }
        }
        else res += '0 ';
        res += state.selectedDice.join(' ') + ' ';
      }
      state.commandString = res;
      // console.log(res)
    },
    setDamageNotify(state, data) {
      // console.log(data)
      state.damageNotify = data;
    },
    setDeck(state, data) {
      // console.log(data)
      state.deck = data;
    },
    removeDeckCard(state, data) {
      let player_id = data.player_id;
      let type = data.type;
      let id = data.id;
      state.deck[player_id][type].splice(id, 1);
    },
    removeAllDeckCards(state, data) {
      let player_id = data.player_id;
      state.deck[player_id].charactors = [];
      state.deck[player_id].cards = [];
    },
    addDeckCard(state, data) {
      let player_id = data.player_id;
      let type = data.type.toLowerCase() + 's';
      let name = data.name;
      state.deck[player_id][type].push({
        type: name.split('/')[0],
        name: name.split('/')[1],
        version: data.version
      });
    },
    setShowDeckDiv(state, data) {
      state.showDeckDiv = data;
    },
    setServerURL(state, data) {
      state.serverURL = data;
    },
    setServerConnected(state, data) {
      state.serverConnected = data;
    },
    addDeckModifyCounter(state) {
      state.deckModifyCounter += 1;
    },
    resetDeckModifyCounter(state) {
      state.deckModifyCounter = 0;
    }
  },
  getters: {
    getImagePath: (state) => (payload) => {
      // let prefix = 'static/images/';
      let prefix = 'https://static.zyr17.cn/GITCG-frontend/images/';
      let type = payload.type;
      let name = payload.name;
      let desc = payload.desc;
      if (type == 'TALENT') {
        type = type + '_' + payload.charactor_name;
      }
      if (name == 'Unknown') {
        type = 'CARD';
        desc = '';
      }
      if (desc && desc != '')
        // have desc, modify name
        name = name + '_' + desc;
      let res = state.imagePath[type + '/' + name];
      if (res && res.slice(0, 5) == 'data:') return res;

      // if (type == 'avatar') {
      //   res = state.imagePath['charactor/' + name];
      //   if (res == undefined) return;
      //   return prefix + res.replace(/cardface\/Char_(Avatar|Enemy|Monster)_/, 'avatar/')
      // }

      if ((type == 'CHARACTOR_STATUS' || type == 'TEAM_STATUS') && res == undefined) {
        let name_arr = name.toLowerCase().split('_');
        let res_name = [];
        for (let i = 0; i < name_arr.length; i++) {
          res_name.push(name_arr[i].charAt(0).toUpperCase() + name_arr[i].slice(1).toLowerCase());
        }
        res_name = res_name.join('_');
        if (res_name.slice(0, 7) != 'Element')
          res_name = 'Common_' + res_name;
        return prefix + 'status/' + res_name + '.png';
      }

      if ((type == 'SUMMON' || type == 'SUPPORT') && payload.small_card && res) {
        res = res.replace('cardface', 'small_card')
      }
      if (res == undefined) return;
      return prefix + res;
    },
    getNamesWithType: (state) => (type) => {
      let result = [];
      for (let key in state.imagePath) {
        if (key.split('/')[0] == type) {
          result.push(key)
        }
      }
      return result;
    },
    findNearestVersion: (state) => (name, version, descs) => {
      let nearest = null;
      for (let key in descs)
        if (key.includes(name) && key != name) {
          key = key.split('/');
          let last = key[key.length - 1];
          if (last == '') continue;
          if (last > version) continue;
          if (nearest == null || last > nearest) nearest = last;
        }
      return nearest;
    },
    getNameWithDesc: (state) => (obj) => {
      if (obj.desc && obj.desc != '') return obj.name + '_' + obj.desc;
      return obj.name;
    }
  },
});
