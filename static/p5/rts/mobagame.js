
class HeroUnit extends UnitClass {
  constructor() {
    super("Hero");
    this.r = 12;
    this.maxSpeed = 3;
    this.maxForce = 6;
    this.maxHealth = 500;
    // TODO experience and leveling up stats?
  }

  create(pos, team) {
    let hero = super.create(pos, team);
    hero.health.setRecovery(10);
    hero.health.setScale(18);
    return hero;
  }
}

class Spawner extends BuildingClass {
  constructor() {
    super("Spawner");
    this.r = 50;
    this.maxHealth = 10000;
  }
}

class MobaGame {
  constructor(view, map) {
    this.view = view;
    this.map = map;
    this.mousePos = createVector(0, 0);
  }

  init() {
    let bounds = this.map.getBounds();
    let topLeft = createVector(50, 50);
    let topRight = createVector(bounds.x - 50, 50);
    let bottomLeft = createVector(50, bounds.y - 50);
    let bottomRight = createVector(bounds.x - 50, bounds.y - 50);

    let tower = new Tower();
    let spawner = new Spawner();
    let spawnUnit = new UnitClass();
    spawnUnit.sightRange = 100;

    let redTeam = new Team(this, color('#D33430'));
    let redSpawner = spawner.createBuilding(createVector(50, 50), redTeam);
    redSpawner.setAction(new SpawnCommand(spawnUnit, [
      [bottomRight],
      [bottomLeft, bottomRight],
      [topRight, bottomRight]
    ]));
    this.map.addUnit(redSpawner);
    this.map.addUnit(tower.createBuilding(createVector(150, 50), redTeam));
    this.map.addUnit(tower.createBuilding(createVector(50, 150), redTeam));
    this.map.addUnit(tower.createBuilding(createVector(bounds.x / 2, 50), redTeam));
    this.map.addUnit(tower.createBuilding(createVector(50, bounds.y / 2), redTeam));

    this.hero = new HeroUnit().create(createVector(100, 100), redTeam);
    this.map.addUnit(this.hero);

    let blueTeam = new Team(this, color('#5C16C8'))
    let blueSpawner = spawner.createBuilding(createVector(bounds.x - 50, bounds.y - 50), blueTeam);
    blueSpawner.setAction(new SpawnCommand(spawnUnit, [
      [topLeft],
      [bottomLeft, topLeft],
      [topRight, topLeft]
    ]));
    this.map.addUnit(blueSpawner);
    this.map.addUnit(tower.createBuilding(createVector(bounds.x - 150, bounds.y - 50), blueTeam));
    this.map.addUnit(tower.createBuilding(createVector(bounds.x - 50, bounds.y - 150), blueTeam));
    this.map.addUnit(tower.createBuilding(createVector(bounds.x / 2, bounds.y - 50), blueTeam));
    this.map.addUnit(tower.createBuilding(createVector(bounds.x - 50, bounds.y / 2), blueTeam));
  }

  applyControl(unit, force) {
    // This is used for swipe/touch movement.
    unit.applyForce(force);
  }

  moveToTarget(unit, target) {
    // This is used for swipe/touch movement.
    unit.setAction(new MoveCommand(target));
  }

  click() {
    this.mousePos.set(mouseX, mouseY);
    // this.hero.targetPos = view.toGame(mousePos);
    this.hero.setAction(new MoveCommand(view.toGame(mousePos)));
  }

  show() {
    if (!this.hero.finished()) {
      this.view.setCenter(this.hero.pos);
    }
    this.view.update();

    this.map.update();
    this.map.show(this.view);

    this.view.coverEdges();
  }
}
