from flask import Blueprint
from flask import url_for
from shared.helpers.angular import Angular

eighti_bp = Blueprint('8i', __name__)

@eighti_bp.route('')
def eighti():
    return ''.join([
        "Projects I worked on for 8i<br>",
        "Caveat these are only partially working<br>",
        "<a href='new_site'> 8i Website</a><br>"
        "<a href='scene_player'> Scene Player</a><br>"
        "<a href='web-director'> Web Director</a><br>"
    ])

@eighti_bp.route('web-director/')
def web_director():
    app = Angular('director')
    app.base = '/8i/web-director/'
    app.scripts = [
        'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.2.1/jquery.min.js',
        url_for('static', filename="js/three.min.js"),
        url_for('static', filename="js/three.js/DeviceOrientationControls.js"),
        url_for('static', filename='js/three.js/OBJLoader.js'),
        url_for('static', filename="8i/scene_player/8iscene.controls.js"),
        url_for('static', filename='8i/js/eighti/eighti.min.js'),
        url_for('static', filename='8i/js/eighti/dahparser.js'),

        url_for('static', filename='8i/scene_player/player2Service.js'),
        url_for('static', filename='8i/scene_player/skyBackground.js'),
        url_for('static', filename='8i/scene_player/OBJObject.js'),

        url_for('static', filename='8i/director/Director3dControls.js'),
        url_for('static', filename='8i/director/OBJHelper.js'),
        url_for('static', filename='8i/director/director.js'),
    ]
    app.styles = [
        url_for('static', filename='8i/rfonts/SimpleLine/simple-line-icons.css'),
        url_for('static', filename='8i/director/director.css'),
        url_for('static', filename='8i/new_site/fonts.css'),
    ]

    return app.render()

@eighti_bp.route('scene_player/')
def new_player():
    app = Angular('scenePlayer')
    app.base = '/8i/scene_player/'
    app.scripts = [
        'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.2.1/jquery.min.js',
        url_for('static', filename="js/three.min.js"),
        url_for('static', filename="js/three.js/DeviceOrientationControls.js"),
        url_for('static', filename="8i/scene_player/8iscene.controls.js"),
        url_for('static', filename='8i/js/eighti/eighti.min.js'),

        url_for('static', filename='8i/scene_player/player2Service.js'),
        url_for('static', filename='8i/scene_player/scenePlayer.js'),
        url_for('static', filename='8i/scene_player/skyBackground.js'),
        url_for('static', filename='8i/scene_player/OBJObject.js'),
        url_for('static', filename='8i/new_site/8iTemplate.js'),
    ]
    app.styles = [
        url_for('static', filename='8i/rfonts/SimpleLine/simple-line-icons.css'),
        url_for('static', filename='8i/new_site/template.css'),
        url_for('static', filename='8i/scene_player/scenePlayer.css'),
        url_for('static', filename='8i/new_site/fonts.css'),
    ]

    return app.render()

@eighti_bp.route('new_site/')
def new_8i_site():
    app = Angular('8i')
    app.base = '/8i/new_site/'
    app.scripts = [
        'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.2.1/jquery.min.js',
        url_for('static', filename="js/three.min.js"),
        url_for('static', filename='8i/new_site/8i.controls.js'),
        url_for('static', filename="js/three.js/DeviceOrientationControls.js"),

        url_for('static', filename='8i/js/eighti/eighti.min.js'),

        url_for('static', filename='8i/new_site/playerControls.js'),

        url_for('static', filename='8i/js/eighti/eighti.lib.js'),

        url_for('static', filename='8i/new_site/holo.js'),
        url_for('static', filename='8i/new_site/8iTemplate.js'),
        url_for('static', filename='8i/new_site/8i.js'),
    ]
    app.styles = [
        url_for('static', filename='8i/new_site/8iTemplate.css'),
        url_for('static', filename='8i/new_site/main.css'),
        url_for('static', filename='8i/new_site/holo.css'),
        url_for('static', filename='8i/new_site/fonts.css'),
    ]

    return app.render()
