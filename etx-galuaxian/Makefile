DEST?=_site

all: lua

deps: node_modules/.bin/tstl

node_modules/.bin/tstl: package.json
	npm i

lua: deps
	node_modules/.bin/tstl
	mkdir -p $(DEST)/SCRIPTS
	mkdir -p $(DEST)/IMAGES
	mkdir -p $(DEST)/SOUNDS
	cp -f src/galuaxian.lua $(DEST)/SCRIPTS/GaLuaxian.lua
	cp -f src/galuaxian-widget.lua $(DEST)/galuaxian.lua
	cp -f assets/IMAGES/*.png $(DEST)/IMAGES/
	cp -f assets/SOUNDS/*.wav $(DEST)/SOUNDS/

clean:
	rm -f package-lock.json
	rm -rf $(DEST) node_modules src/*.lua
