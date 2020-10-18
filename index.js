const axios = require('axios').default;
const mongoose = require('mongoose');
const cheerio = require('cheerio');
const TelegramBot = require('node-telegram-bot-api');
const dotenv = require('dotenv').config();
const token = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useFindAndModify: false,
    useCreateIndex: true
});

const userSchema = new mongoose.Schema({
    userId: {
        type: Number,
        trim: true,
        unique: true
    },
    urls: {
        type: Array
    }
});

const user = mongoose.model('url', userSchema, 'users');



const bot = new TelegramBot(token, { polling: true });


async function getPrice(url) {
    const res = await axios.get(url, {
        headers: {
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.75 Safari/537.36"
        }
    });

    const $ = cheerio.load(res.data);
    const price = $("#priceblock_ourprice").text().replace(/[^0-9.]+/g, '') || $("#priceblock_dealprice").text().replace(/[^0-9.]+/g, '');
    return price;
}

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    bot.sendMessage(chatId, `Welcome ${msg.chat.first_name} to amazon price tracker.`);

    user.findOne({ userId: chatId })
        .then((data) => {
            if (data === null) {
                const insert = new user({ userId: chatId });
                insert.save().then(() => {
                    console.log(insert);
                });
            }
        })


})

bot.onText(/\/add (.+)/, async(msg, match) => {

    const chatId = msg.chat.id;
    const resp = match[1];

    user.findOneAndUpdate({ userId: chatId }, { $push: { urls: resp } }, ((err, data) => {
        if (err) {
            console.log(err);
        } else {
            bot.sendMessage(chatId, "Link added sucessfully");
        }
    }))

});

bot.onText(/\/clearurls/, async(msg) => {
    const chatId = msg.chat.id;
    await user.updateOne({ userId: chatId }, { $unset: { urls: 1 } }, ((err, data) => {
        if (err) {
            console.log(err);
        } else {
            bot.sendMessage(chatId, "Urls deleted successfully");
        }
    }))
})

bot.onText(/\/urls/, async(msg) => {

    const chatId = msg.chat.id;
    let text = "";
    let userdetail = await user.findOne({ userId: chatId });
    console.log(userdetail);
    console.log(userdetail.urls);
    if (userdetail.urls.length == 0) {
        await bot.sendMessage(chatId, "No urls added yet send /add <url> to add");
    } else {

        for (let i = 0; i < userdetail.urls.length; i++) {

            text = `${text}${i + 1}. ${userdetail.urls[i]}\n`;
        }
        await bot.sendMessage(chatId, text);
    }

});


bot.onText(/\/track/, async(msg) => {
    let currentPrice = [];
    const chatId = msg.chat.id;
    let userdetail = await user.findOne({ userId: chatId });
    console.log(userdetail);

    if (userdetail.urls.length == 0) {
        bot.sendMessage(chatId, "No urls added yet.Add them by sending /add (your url here).")
    } else {
        bot.sendMessage(chatId, "Tracking started");


        for (let i = 0; i < userdetail.urls.length; i++) {

            let price = await getPrice(userdetail.urls[i]);
            currentPrice.push(price);
            console.log(currentPrice);
        }



        let autocheck = setInterval(async() => {

            for (let i = 0; i < userdetail.urls.length; i++) {

                let latestPrice = await getPrice(userdetail.urls[i]);
                if (latestPrice == currentPrice[i]) {
                    console.log(`latest Price ${latestPrice}`);
                    console.log(`current Price ${currentPrice[i]}`);
                    continue;
                } else {
                    bot.sendMessage(chatId, `Price dropped to ${latestPrice} of ${userdetail.urls[i]}`);
                    clearInterval(autocheck);
                }
            }

        }, 60000);
    }
})