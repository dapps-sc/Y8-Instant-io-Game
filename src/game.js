/*
* Connects the client side with socket.io to the server-side and displays the data to the user.
*/

import 'phaser'
import Preload from 'preloader'
import * as tf from '@tensorflow/tfjs';

export default class Game extends Phaser.Scene {

  constructor() {
    super({ key: 'game' });
  }

  preload() {
    this.coinsCollected = 0;
    this.outputCount = 4;
    this.trainingCount = 50;
    this.batchSize = 5;
    this.numTestExamples = 10;
    this.width = this.sys.game.canvas.width;
    this.height = this.sys.game.canvas.height;
    this.centerX = this.width / 2;
    this.centerY = this.height / 2;
    this.buttonSound = this.sound.add('bottom', {});
    this.name = Math.random().toString(36).substring(7);
    this.direction = { up: false, right: false, down: false, left: false };
  }

  createModel() {
    this.model = tf.sequential();
    this.model.add(tf.layers.conv2d({
      inputShape: [224, 224 , 3],
      kernelSize: 3,
      activation: 'relu',
      filters: 8
    }));
    this.model.add(
      tf.layers.maxPooling2d({poolSize: 3})
    );
    this.model.add(tf.layers.conv2d({
      inputShape: [16, 16],
      kernelSize: 3,
      activation: 'relu',
      filters: 8
    }));
    this.model.add(
      tf.layers.maxPooling2d({poolSize: 3})
    );

    this.model.add(tf.layers.globalAveragePooling2d({}));

    this.model.add(tf.layers.dense({units: this.outputCount, activation: 'softmax'}));
    this.model.compile({
      loss: 'categoricalCrossentropy',
      optimizer: 'sgd',
      metrics: ['accuracy']
    });

    this.model.summary();
  }

  create() {
    this.createModel();

    const map = this.make.tilemap({ key: 'map' });
    var groundTiles = map.addTilesetImage('ground_1x1');
    var coinTiles = map.addTilesetImage('coin');
    map.createDynamicLayer('Background Layer', groundTiles, 0, 0);
    this.groundLayer = map.createDynamicLayer('Ground Layer', groundTiles, 0, 0);
    this.coinLayer = map.createDynamicLayer('Coin Layer', coinTiles, 0, 0);

    this.groundLayer.setCollisionBetween(1, 25);

    var hitCoin = (sprite, tile) => {
      this.coinLayer.removeTileAt(tile.x, tile.y);
      this.coinsCollected += 1;

      // Return true to exit processing collision of this tile vs the sprite - in this case, it
      // doesn't matter since the coin tiles are not set to collide.
      return false;
   }

    // This will set Tile ID 26 (the coin tile) to call the function "hitCoin" when collided with
    this.coinLayer.setTileIndexCallback(26, hitCoin, this);

    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    this.ship = this.physics.add.sprite(this.centerX, this.centerY - 160, 'ship')
    this.ship.setBounce(0.1);
    this.ship.scale = 0.5 

    this.physics.add.collider(this.ship, this.groundLayer);
    this.physics.add.overlap(this.ship, this.coinLayer);
    this.cameras.main.startFollow(this.ship);

    var debugGraphics = this.add.graphics();

    
    this.ship.setInteractive({ useHandCursor: true });
    this.input.setDraggable(this.ship);

    this.input.keyboard.on('keydown-UP', (event) => {
     this.ship.y -= 5;
     this.direction.up = true;
    });
    this.input.keyboard.on('keydown-RIGHT', (event) => {
      this.ship.x += 5;
      this.direction.right = true;
    });
    this.input.keyboard.on('keydown-DOWN', (event) => {
      this.ship.y += 5;
      this.direction.down = true;
    });
    this.input.keyboard.on('keydown-LEFT',  (event) => {
      this.ship.x -= 5;
      this.direction.left = true;
    });
    this.input.keyboard.on('keyup-UP', (event) => {
     this.direction.up = false;
    });
    this.input.keyboard.on('keyup-RIGHT', (event) => {
      this.direction.right = false;
    });
    this.input.keyboard.on('keyup-DOWN', (event) => {
      this.direction.down = false;
    });
    this.input.keyboard.on('keyup-LEFT',  (event) => {
      this.direction.left = false;
    });

    this.input.keyboard.on('keyup-M', (event) => {
      var machineCanvas = document.getElementById('machine-canvas');
      var humanCanvas = document.getElementById('phaser');

      if (window.getComputedStyle(machineCanvas).display === 'none') {
        machineCanvas.style.display = 'block';
        humanCanvas.style.display = 'none';
      } else {
        machineCanvas.style.display = 'none';
        humanCanvas.style.display = 'block';
      }
    }, this);

    this.input.keyboard.on('keyup-E', (event) => {
      this.evaluate();
    });

    this.input.keyboard.on('keyup-T', (event) => {
      this.train(this.trainingCount, this.batchSize, this.numTestExamples) 
    }, this);

    setTimeout(() => {
      this.captureReplay();
    }, 1000)
  }

  async evaluate() {
    this.game.renderer.snapshot(async (image) => {
      var mc = document.getElementById('machine-canvas');
      var context = mc.getContext('2d');
      var scale = this.scaleImage(image.width, image.height, 224, 224, false);
      
      context.drawImage(
        image,
        scale.targetleft,
        scale.targettop,
        scale.width,
        scale.height
      );

      var newImg = new Image;
      newImg.onload = async () => {
        this.output = this.model.apply(this.shapeImage(newImg));
        this.output.print();
      }
      newImg.src = mc.toDataURL();
    });
  }

  shapeImage(element) {
    var tensor = tf.browser.fromPixels(element)
    tensor = tf.cast(tensor, "float32");

    var offset = tf.scalar(127.5);
    // Normalize the image from [0, 255] to [-1, 1].
    var normalized = tensor.sub(offset).div(offset);

    // Reshape to a single-element batch
    return normalized.reshape([1, 224, 224, 3]);
  }

  captureReplay() {
    var timer = this.time.addEvent({
      delay: 250,
      callback: () => {
        this.captureCanvas()
      },
      callbackScope: this,
      repeat: this.trainingCount
    });
  }

  captureCanvas() {
    this.game.renderer.snapshot((image) => {
      console.log(' capturing training data, use arrows keys to move');
      var mc = document.getElementById('machine-canvas');
      var context = mc.getContext('2d');
      var scale = this.scaleImage(image.width, image.height, 224, 224, false);
      
      context.drawImage(
        image,
        scale.targetleft,
        scale.targettop,
        scale.width,
        scale.height
      );

      var newImg = new Image;
      newImg.dataset.direction = this.shortDirection();
      newImg.onload = () => {
        document.getElementById('replay').appendChild(newImg);
      }
      newImg.src = mc.toDataURL();
    });
  }

  shortDirection() {
    var dir = [[0, 0, 0, 0]];
    if (this.direction.up) { dir[0][0] = 1; }
    if (this.direction.right) { dir[0][1] = 1; }
    if (this.direction.down) { dir[0][2] = 1; }
    if (this.direction.left) { dir[0][3] = 1; }
    return JSON.stringify(dir);
  }

  async train(iterations, batchSize, numTestExamples) {
    var replay = document.getElementById('replay');

    for (let i = 0; i < iterations; ++i) {
      var input = this.shapeImage(replay.children[i]);
      var label = JSON.parse(replay.children[i].dataset.direction);
      var labelTensor = tf.tensor2d(label)

      //var testXs = tf.tensor2d([[this.shapeImage(replay.children[1])]])
      //var testYs = tf.tensor2d([[replay.children[1].dataset.direction]])

    
      const result = await this.model.fit(input, labelTensor, {
        epochs: 1,
        batchSize,
        //validationData: testXs, testYs,
        yieldEvery: 'epoch'
      });
      console.log(result.history.loss[0], result.history.acc[0]);
    }
  }

  scaleImage(srcwidth, srcheight, targetwidth, targetheight, fLetterBox) {
    var result = { width: 0, height: 0, fScaleToTargetWidth: true };

    if ((srcwidth <= 0) || (srcheight <= 0) || (targetwidth <= 0) || (targetheight <= 0)) {
      return result;
    }

    // scale to the target width
    var scaleX1 = targetwidth;
    var scaleY1 = (srcheight * targetwidth) / srcwidth;

    // scale to the target height
    var scaleX2 = (srcwidth * targetheight) / srcheight;
    var scaleY2 = targetheight;

    // now figure out which one we should use
    var fScaleOnWidth = (scaleX2 > targetwidth);
    if (fScaleOnWidth) {
      fScaleOnWidth = fLetterBox;
    } else {
      fScaleOnWidth = !fLetterBox;
    }

    if (fScaleOnWidth) {
      result.width = Math.floor(scaleX1);
      result.height = Math.floor(scaleY1);
      result.fScaleToTargetWidth = true;
    } else {
      result.width = Math.floor(scaleX2);
      result.height = Math.floor(scaleY2);
      result.fScaleToTargetWidth = false;
    }
    result.targetleft = Math.floor((targetwidth - result.width) / 2);
    result.targettop = Math.floor((targetheight - result.height) / 2);

    return result;
  }
}
