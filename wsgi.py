from runner import create_app
import config

application = create_app(config)

if __name__ == "__main__":
	application.run()
