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

  recipes['iron plate'] = new Recipe({'iron ingot': 3 / 2}, 6 / 2);
  recipes['iron rod'] = new Recipe({'iron ingot': 1}, 4);
  recipes['screw'] = new Recipe({'iron ingot': 1 / 4}, 24 / 20);

  recipes['reinforced iron plate'] = new Recipe({'iron plate': 6, 'screw': 12}, 12);

  recipes['modular frame'] = new Recipe({'iron rod': 12 / 2, 'reinforced iron plate': 3 / 2}, 60 / 2);

  // recipes['steel ingot'] = new Recipe({'coal': 3 / 3, 'iron ore': 3 / 3}, 4 / 3);
  // TODO alternate recipes?
  recipes['steel ingot'] = new Recipe({'coal': 2 / 3, 'iron ingot': 2 / 3}, 3 / 3);

  recipes['steel pipe'] = new Recipe({'steel ingot': 3 / 2}, 6 / 2);
  recipes['steel beam'] = new Recipe({'steel ingot': 4}, 4);

  recipes['encased industrial beam'] = new Recipe({'steel beam': 4, 'concrete': 5}, 10);

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
