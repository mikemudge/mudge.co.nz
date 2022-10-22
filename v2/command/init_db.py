from flask import current_app
from flask_script import Manager

Command = Manager(usage='Setup/Reset the database')

@Command.command
def reset():
    # The order of these is important.
    cursor = connection.cursor()
    create_table_query = '''DROP TABLE blast;'''
    cursor.execute(create_table_query)

@Command.command
def init_database():
    # The order of these is important.
    cursor = connection.cursor()
    create_table_query = '''CREATE TABLE blast
          (ID INT PRIMARY KEY     NOT NULL,
          MODEL           TEXT    NOT NULL,
          PRICE         REAL); '''
    # Execute a command: this creates a new table
    cursor.execute(create_table_query)
