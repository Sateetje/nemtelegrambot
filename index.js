#!/usr/bin/env node

'use strict'
const NEM = require('./nodejs2nem/NEM.js');
const Telegram = require('telegram-node-bot')
const TelegramBaseController = Telegram.TelegramBaseController
const StartController = Telegram.StartController
const TextCommand = Telegram.TextCommand

var fs = require('fs');
var config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
var telegram_key = config.telegram_key

console.log("nis address: " + config.nis_address)
console.log("telegram_key: " + config.telegram_key)

var conf = { 'nis_address': config.nis_address};
var nem = new NEM(conf);

Array.prototype.contains = function(element){
        return this.indexOf(element) > -1;
};

const tg = new Telegram.Telegram(telegram_key, {
        workers: 1,
        webAdmin: {
                port: config.local_port,
                host: '192.168.100.222'
        }
})

function makeDir(dirname) {
        if (!fs.existsSync(dirname)){
                fs.mkdirSync(dirname);
        }
}

function getDirectories (srcpath) {
        const fs = require('fs')
        const path = require('path')
        return fs.readdirSync(srcpath)
        .filter(file => fs.statSync(path.join(srcpath, file)).isDirectory())
}

function readAddress(address, old_wallet, chat_id, cb){
        console.log("querying: " + address)
        var query = '/account/mosaic/owned?address=' + address
        nem.nisGet(query, null
                        ,function(err) {
                console.log(err)
                tg.api.sendMessage(chat_id, 'Error while querying wallet: [' + address + "]")
                tg.api.sendMessage(chat_id, 'Error= {' + err + '}')
        }
        ,function(res) {
                if(res.error != undefined && res.error){
                        console.log(res)
                        cb(old_wallet, res)
                        return;
                }
                res.address = address
                for (var w = 0; w < res.data.length; w++) {
                        var divisibility = 1000000 //getDivisibility(res.data[w].mosaicId.namespaceId, res.data[w].mosaicId.name)

                        res.data[w].quantity = res.data[w].quantity / divisibility
                }

                console.log(res);

                cb(old_wallet, res, chat_id)

                return;
        });
}

function getDivisibility(namespace, mosaic){
        var divisibility = 1000000
        var query = '/namespace/mosaic/definition/page?namespace=' + namespace

        nem.nisGet(query, null
        ,function(err) {
                console.log(err)
                tg.api.sendMessage(chat_id, 'Error while querying namespace: [' + namespace + "]")
                tg.api.sendMessage(chat_id, 'Error= {' + err + '}')
        }
        ,function(res) {
                if(res.error != undefined && res.error){
                        console.log(res)
                        return;
                }

                for (var w = 0; w < res.data.length; w++) {
                        if (res.data[w].mosaic.id.name = mosaic){
                                for (var x = 0; x < res.data[w].mosaic.properties.length; x++) {
                                        if (res.data[w].mosaic.properties[x].name = "divisibility"){
                                                divisibility = Math.pow(10, res.data[w].mosaic.properties[x].value)

                                                break;
                                        }
                                }
                                break;
                        }
                }
        });
        return divisibility;
}

tg.onMaster(() => {
        function checkAccounts(){
                var dirs = getDirectories('./.storage')
                for (var i = 0, len = dirs.length; i < len; i++) {
                        var chat_id = dirs[i]
                        console.log(chat_id)
                        // looping through all the chat ids
                        var wallets_dir = './.storage/' + chat_id
                        var files = fs.readdirSync(wallets_dir)
                        for (var w = 0; w < files.length; w++) {
                                var old_wallet = JSON.parse(fs.readFileSync(wallets_dir + '/' + files[w], 'utf8'))
                                var wallet_key = files[w]
                                readAddress(wallet_key, old_wallet, chat_id, function (old_wallet, wallet, chat_id) {
                                        if(wallet.error != undefined && wallet.error){
                                                console.log(wallet)
                                                $.sendMessage('Error: ' + wallet.error + ' -> ' + wallet.message)
                                                return
                                        }

                                        if(wallet.error != undefined && wallet.error){
                                                console.log(wallet)
                                                return
                                        }

                                        var balanceChanged = false

                                        for (var w = 0; w < wallet.data.length; w++) {
                                                var found = false

                                                for (var x = 0; x < old_wallet.data.length; x++) {
                                                        if (wallet.data[w].mosaicId.namespaceId == old_wallet.data[x].mosaicId.namespaceId && wallet.data[w].mosaicId.name == old_wallet.data[x].mosaicId.name){
                                                                if(wallet.data[w].quantity != old_wallet.data[x].quantity){
                                                                        tg.api.sendMessage(chat_id, "Balance changed:\n" + wallet.address + "\n\nMosaic: " + wallet.data[w].mosaicId.namespaceId + ":" + wallet.data[w].mosaicId.name + "\nOld: " + old_wallet.data[x].quantity + "\nNew: " + wallet.data[w].quantity)
                                                                        balanceChanged = true
                                                                }
                                                                else{
                                                                        console.log("Balance didn't change: " + wallet.address + " [" +  wallet.data[w].mosaicId.namespaceId + ":" + wallet.data[w].mosaicId.name + "]")
                                                                }
                                                                found = true
                                                        }
                                                }

                                                if (!found){
                                                        //console.log('New mosaic for [' + wallet.address + ']: [' + wallet.data[w].quantity + "]" + wallet.data[w].mosaicId.namespaceId + "." + wallet.data[w].mosaicId.name)
                                                        tg.api.sendMessage(chat_id, 'New mosaic:\n' + wallet.address + "\n\nMosaic: " + wallet.data[w].mosaicId.namespaceId + ":" + wallet.data[w].mosaicId.name +  "\nQuantity: " + wallet.data[w].quantity)
                                                        balanceChanged = true
                                                }
                                        }

                                        if (balanceChanged) {
                                                //saving results
                                                console.log('Saving wallet: ' + wallet.address)
                                                var storage_dir = './.storage/' + chat_id
                                                var json_string = JSON.stringify(wallet);
                                                fs.writeFile(storage_dir + '/' + wallet.address, json_string, function (err) {
                                                        if (err) return console.log(err);
                                                });
                                        }
                                })
                        }
                }
        }
        //checking every 2 minutes
        setInterval(checkAccounts, 1 * 120000)
})

tg.onMaster(() => {
        var opt = nem.getOptions();
        console.log(opt);
        //setting up storage
        makeDir('./.storage')
})

class BalanceController extends TelegramBaseController {
        /**
         * @param {Scope} $
         */
        balanceHandler($) {
                // setting up storage folder
                var wallets_dir = './.storage/' + $.chatId.toString()
                if (!fs.existsSync(wallets_dir)){
                        $.sendMessage("You don't have any wallets registered!")
                }
                var files = fs.readdirSync(wallets_dir);

                for (var i = 0, len = files.length; i < len; i++) {
                        var wallet = JSON.parse(fs.readFileSync(wallets_dir + '/' + files[i], 'utf8'))
                        var msg = ""
                                for (var w = 0; w < wallet.data.length; w++) {
                                        msg += wallet.data[w].quantity + " " + wallet.data[w].mosaicId.namespaceId + ":" + wallet.data[w].mosaicId.name + "\n"
                                        //$.sendMessage(files[i] + " balance: " + wallet.data[w].quantity + " " + wallet.data[w].mosaicId.namespaceId + ":" + wallet.data[w].mosaicId.name)
                                }
                        $.sendMessage("Address:\n" + wallet.address + "\n\nBalance:\n" + msg)
                }
        }
        get routes() {
                return {
                        'balanceCommand': 'balanceHandler'
                }
        }
}

class HelpController extends TelegramBaseController {
        /**
         * @param {Scope} $
         */
        helpHandler($) {
                $.sendMessage('This bot registers a NEM wallet and notifies you when the balance changes')
                $.sendMessage('/register to register a new wallet')
                $.sendMessage('/balance to see your current balance')
        }
        get routes() {
                return {
                        'helpCommand': 'helpHandler'
                }
        }
}

class OtherwiseController extends TelegramBaseController {
        handle() {
                console.log('otherwise')
        }
}

class RegisterController extends TelegramBaseController {
        /**
         * @param {Scope} $
         */
        registerHandler($) {
                const form = {
                            wallet: {
                                        q: 'Send me the wallet you\'d like to register',
                                        error: 'Sorry, wrong input',
                                        validator: (message, callback) => {
                                        var wallet_key = message.text.toString().toUpperCase().trim()

                                        //formatting the address removing the -
                                        wallet_key = wallet_key.replace(/-/g,"")

                                        if(!wallet_key || wallet_key.length != 40){
                                                $.sendMessage("Wrong address, please provide a well formed address [NAYFRF6C2DZKKEQEE2SNVBBDG354SYF4XHMYJDFP] or [NAYFRF-6C2DZK-KEQEE2-SNVBBD-G354SY-F4XHMY-JDFP]")
                                                return
                                        }
                                        //reading/saving wallet
                                        readAddress(wallet_key, null, null, function (old, wallet, chat_id) {
                                                if(wallet.error != undefined && wallet.error){
                                                        console.log(wallet)
                                                        $.sendMessage('Error: ' + wallet.error + ' -> ' + wallet.message)
                                                        return
                                                }

                                                if(wallet.error != undefined && wallet.error){
                                                        console.log(wallet)
                                                        return
                                                }
                                                var storage_dir = "./.storage/" + $.chatId.toString()
                                                makeDir(storage_dir)
                                                var json_string = JSON.stringify(wallet)
                                                fs.writeFile(storage_dir + '/' + wallet_key, json_string, function (err) {
                                                        if (err) return console.log(err);
                                                        console.log('File saved: ' + wallet_key);
                                                });
                                                $.sendMessage('Registered wallet: ' + wallet_key)
                                        })
                                                        callback(true, message.text) //you must pass the result also
                                                        return
                                                }
                                    }
                }
                $.runForm(form, (result) => {
                })
        }
        get routes() {
                return {
                        'registerCommand': 'registerHandler'
                }
        }
}

tg.router
.when(new TextCommand('/help', 'helpCommand'), new HelpController())
.when(new TextCommand('/balance', 'balanceCommand'), new BalanceController())
.when(new TextCommand('/register', 'registerCommand'),new RegisterController())
.otherwise(new OtherwiseController())

console.log("Starting bot!")
