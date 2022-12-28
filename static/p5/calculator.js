class Recipe {
  constructor(inputs, rate) {
    this.inputs = [];
    this.rate = rate;
    for (let key of Object.keys(inputs)) {
      this.inputs.push({
        'name': key,
        'amount': inputs[key]
      })
    }
  }
}

function satisfactoryInit() {
  // TODO add a description which can help identify specifics?
  // E.g what machine do you use for this recipe.
  // Rate is calculated as seconds / num, when num is 1, we skip the divide.
  recipes['iron ingot'] = new Recipe({'iron ore': 1}, 2);
  recipes['copper ingot'] = new Recipe({'copper ore': 1}, 2);
  recipes['concrete'] = new Recipe({'limestone': 3}, 4);

  // recipes['steel ingot'] = new Recipe({'coal': 3 / 3, 'iron ore': 3 / 3}, 4 / 3);
  // TODO alternate recipes?
  recipes['steel ingot'] = new Recipe({'coal': 2 / 3, 'iron ingot': 2 / 3}, 3 / 3);

  // Constructor parts
  recipes['iron plate'] = new Recipe({'iron ingot': 3 / 2}, 6 / 2);
  recipes['iron rod'] = new Recipe({'iron ingot': 1}, 4);
  recipes['screw'] = new Recipe({'iron ingot': 1 / 4}, 24 / 20);

  recipes['wire'] = new Recipe({'copper ingot': 1 / 2}, 4 / 2);
  recipes['cable'] = new Recipe({'wire': 2}, 2);

  recipes['silica'] = new Recipe({'raw quartz': 3 / 5}, 8 / 5);
  recipes['quartz crystal'] = new Recipe({'raw quartz': 5 / 3}, 8 / 3);

  recipes['steel pipe'] = new Recipe({'steel ingot': 3 / 2}, 6 / 2);
  recipes['steel beam'] = new Recipe({'steel ingot': 4}, 4);

  // Assembler parts.
  recipes['reinforced iron plate'] = new Recipe({'iron plate': 6, 'screw': 12}, 12);

  recipes['modular frame'] = new Recipe({'iron rod': 12 / 2, 'reinforced iron plate': 3 / 2}, 60 / 2);

  recipes['encased industrial beam'] = new Recipe({'steel beam': 4, 'concrete': 5}, 10);

  recipes['rotor'] = new Recipe({'iron rod': 5, 'screw': 25}, 15);
  recipes['stator'] = new Recipe({'steel pipe': 3, 'wire': 8}, 12);

  recipes['motor'] = new Recipe({'rotor': 2, 'stator': 2}, 12);

  // Aluminum chain.
  recipes['aluminum solution'] = new Recipe({
    'bauxite': 10 / 12,
    'water': 10 / 12
  }, 3 / 12);

  // TODO handle extra outputs, E.g water here.
  recipes['aluminum scrap'] = new Recipe({
    'alumina solution': 4 / 6,
    'coal': 2 / 6
  }, 1 / 6);

  recipes['aluminum ingot'] = new Recipe({
    'aluminum scrap': 6 / 4,
    'silica': 5 / 4
  }, 4 / 4);

  // recipes['aluminum casing'] - new Recipe({}, ?)
  // Fused modular frame chain.
  // TODO could pass in 3 as a multiplier value to reduce floating point usage?
  recipes['heavy modular frame'] = new Recipe({
    'modular frame': 8 / 3,
    'encased industrial beam': 10 / 3,
    'steel pipe': 36 / 3,
    'concrete': 22 / 3
  }, 64 / 3);

  recipes['fused modular frame'] = new Recipe({
    'heavy modular frame': 1,
    'aluminum casing': 50,
    'nitrogen gas': 25
  }, 40);

  // Turbo motor chain.
  recipes['cooling system'] = new Recipe({
    'heat sink': 2,
    'rubber': 2,
    'water': 5,
    'nitrogen gas': 25
  }, 10);

  recipes['radio control unit'] = new Recipe({
    'aluminum casing': 32 / 2,
    'crystal oscillator': 1 / 2,
    'computer': 1 / 2
  }, 2.5 * 60);

  recipes['turbo motor'] = new Recipe({
    'cooling system': 4,
    'radio control unit': 2,
    'motor': 4,
    'rubber': 24
  }, 40);
}

function dysonSphereProjectInit() {
  // Rate is calculated as seconds / num, when num is 1, we skip the divide.

  // TODO Mk 1 assembler has a .75 production rate
  // Mk 2 is 1 and Mk 3 is 1.5. Assume mk 2 everywhere for now.

  // Basic ores.
  recipes['iron ingot'] = new Recipe({'iron ore': 1}, 1);
  recipes['copper ingot'] = new Recipe({'copper ore': 1}, 1);
  recipes['magnet'] = new Recipe({'iron ore': 1}, 1.5);

  // TODO rate here is not certain, but allows us to calculate all sciences together.
  recipes['science'] = new Recipe({
    'blue science': 1,
    'red science': 1,
    'yellow science': 1,
    'purple science': 1,
    'green science': 1,
  }, 1);

  recipes['magnetic coil'] = new Recipe({'magnet': 2, 'copper ingot': 1}, 1);
  recipes['circuit board'] = new Recipe({'iron ingot': 2, 'copper ingot': 1}, 1);
  recipes['gear'] = new Recipe({'iron ingot': 1}, 1);

  recipes['blue science'] = new Recipe({'magnetic coil': 1, 'circuit board': 1}, 3);

  // TODO can also get hydrogen from gas giants?

  // TODO the following 2 recipes are the same, but with 2 outputs.
  recipes['hydrogen'] = new Recipe({'oil': 2}, 4);
  recipes['refined oil'] = new Recipe({'oil': 2 / 2}, 4 / 2);
  recipes['graphite'] = new Recipe({'coal': 2}, 2);

  recipes['red science'] = new Recipe({'hydrogen': 2, 'graphite': 2}, 6);

  recipes['diamond'] = new Recipe({'graphite': 1}, 2);
  recipes['titanium ingot'] = new Recipe({'titanium ore': 2}, 2);
  recipes['plastic'] = new Recipe({'refined oil': 2, 'graphite': 1}, 3);
  recipes['organic crystal'] = new Recipe({'refined oil': 1, 'water': 1, 'plastic': 2}, 6);
  recipes['titanium crystal'] = new Recipe({'titanium ingot': 1, 'organic crystal': 1}, 8);
  recipes['yellow science'] = new Recipe({'diamond': 1, 'titanium crystal': 1}, 8);

  recipes['silicon'] = new Recipe({'silicon ore': 2}, 2);
  recipes['crystal silicon'] = new Recipe({'silicon': 1}, 2);
  recipes['microcrystalline component'] = new Recipe({'silicon': 2, 'copper ingot': 1}, 2);

  recipes['sulfuric acid'] = new Recipe({'refined oil': 6 / 4, 'stone': 8 / 4, 'water': 4 / 4}, 6 / 4);
  recipes['graphene'] = new Recipe({'graphite': 3, 'sulfuric acid': 1}, 3);
  recipes['carbon nanotube'] = new Recipe({'graphene': 3, 'titanium ingot': 1}, 4);

  recipes['particle broadband'] = new Recipe({'carbon nanotube': 2, 'crystal silicon': 2, 'plastic': 1}, 8);
  recipes['processor'] = new Recipe({'circuit board': 2, 'microcrystalline component': 2}, 3);
  recipes['purple science'] = new Recipe({'particle broadband': 1, 'processor': 1}, 10);

  recipes['electric motor'] = new Recipe({'iron ingot': 2, 'gear': 1, 'magnetic coil': 1}, 2);
  recipes['electromagnetic turbine'] = new Recipe({'electric motor': 2, 'magnetic coil': 2}, 2);

  recipes['deuterium'] = new Recipe({'hydrogen': 10 / 5}, 2.5 / 5);
  recipes['particle container'] = new Recipe({'electromagnetic turbine': 2, 'copper ingot': 2, 'graphene': 2}, 4);
  recipes['strange matter'] = new Recipe({'particle container': 2, 'iron ingot': 2, 'deuterium': 10}, 8);
  recipes['graviton lens'] = new Recipe({'strange matter': 1, 'diamond': 4}, 6);

  recipes['glass'] = new Recipe({'stone': 2}, 2);
  recipes['titanium glass'] = new Recipe({'glass': 2, 'titanium ingot': 2, 'water': 2}, 5);
  recipes['casimir crystal'] = new Recipe({'titanium crystal': 1, 'graphene': 2, 'hydrogen': 12}, 4);
  recipes['plane filter'] = new Recipe({'casimir crystal': 2, 'titanium glass': 2}, 12);
  recipes['quantum chip'] = new Recipe({'plane filter': 2, 'processor': 2}, 6);
  recipes['green science'] = new Recipe({'graviton lens': 1 / 2, 'quantum chip': 1 / 2}, 24 / 2);
}

function calculateRequirements(query) {
  let required = [query];
  let totals = {};
  for(let i = 0; i < required.length; i++) {
    let name = required[i].name;
    let amount = required[i].amount;
    let reason = required[i].reason;
    let recipe = recipes[name];
    if (!totals[name]) {
      totals[name] = {amount: 0, machines: 0};
    }
    if (!recipe) {
      console.log("Need", amount, name, "for", reason, "(no recipe available)");
      totals[name].amount += amount;
      continue;
    }
    // This is how many machines should be running the recipe.
    let parallelism = amount / (60 / recipe.rate);
    // 10 / (60 / 30) = 5 for modular frames (30 seconds each) to get 10 per minute.
    console.log("Need", parallelism, "machines making", amount, name, "for", reason);

    totals[name].amount += amount;
    totals[name].machines += parallelism;

    // Now determine how much of each input we will need.
    for (let i2 = 0; i2 < recipe.inputs.length; i2++) {
      let input = recipe.inputs[i2];
      // console.log(amount, name, "needs", input.amount * amount, input.name);
      required.push({
        'name': input.name,
        'amount': amount * input.amount,
        'reason': name,
      });
    }
  }

  return totals;
}

function setup() {
  createCanvas(500, 500);

  recipes = {};

  args = new URLSearchParams(location.search);
  let game = args.get('game');
  if (game == null) {
    game = 'DSP';
  }

  if (game === 'satisfactory') {
    satisfactoryInit();
  } else if (game === "DSP") {
    dysonSphereProjectInit();
  }

  let name = args.get('name');
  if (name == null) {
    name = 'modular frame';
  }

  let amount = args.get('amount');
  if (amount == null) {
    amount = 10;
  } else {
    amount = parseInt(amount);
  }

  requirements = calculateRequirements({
    'name': name,
    'amount': amount,
    reason: 'main output'
  });
  console.log(requirements);
  noLoop();
}

function draw() {
  background(0);

}
