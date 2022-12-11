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
  satisfactoryInit();

  args = new URLSearchParams(location.search);

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
