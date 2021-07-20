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
        type: Array,
        trim: true
    }
});

const user = mongoose.model('url', userSchema, 'users');



const bot = new TelegramBot(token, {
    polling: true
});


async function getData(url) {
    let data = {};
    const res = await axios.get(url, {
        headers: {
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.75 Safari/537.36"
        }
    });

    const $ = cheerio.load(res.data);
    const mrp = $('span.priceBlockStrikePriceString').text().trim();
    const price = $("#priceblock_ourprice").text().replace(/[^0-9.]+/g, '') || $("#priceblock_dealprice").text().replace(/[^0-9.]+/g, '') || $("#priceblock_saleprice").text() || "";
    const stock = $('#add-to-cart-button').attr('title') || $("#availability > span").text().trim() === "In stock." ? "Add to Shopping Cart" : "";
    const name = $('#productTitle').text().trim();
    const you_save = $('td.priceBlockSavingsString').text().trim().split('\n').slice(-1).pop();
    return data = {
        "name": name,
        "mrp": mrp,
        "price": price,
        "you_save": you_save,
        "stock": stock
    };
}

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    bot.sendMessage(chatId, `Welcome ${msg.chat.first_name} to <b>Amazon price tracker bot.</b>Send /help for command details and for any further query contact <a href="tg://user?id=635671352">here</a>.`, {
        parse_mode: "HTML"
    });

    user.findOne({
            userId: chatId
        })
        .then((data) => {
            if (data === null) {
                const insert = new user({
                    userId: chatId
                });
                insert.save().then(() => {
                    console.log(insert);
                });
            }
        })


})

bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;

    bot.sendMessage(chatId, `/add - Add new url\n/urls - See your urls\n/track - Start price tracker\n/clearurls - Clear all urls\n/notify - Start stock tracker\n<b>Note:</b> After adding url send desired command /track or /stock to start tracking.`, {
        parse_mode: "HTML"
    });

})

bot.onText(/\/add (.+)/, async (msg, match) => {

    const chatId = msg.chat.id;
    const resp = match[1];

    let detail = await getData(resp);
    user.findOneAndUpdate({
        userId: chatId
    }, {
        $push: {
            urls: resp
        }
    }, ((err, data) => {
        if (err) {
            console.log(err);
        } else {
            bot.sendMessage(chatId, `<i>Product:</i> ${detail.name}\n<i>Current Price:</i> ${detail.price}\n<b>Added sucessfully.</b>`, {
                parse_mode: "HTML"
            });
        }
    }))

});

bot.onText(/\/clearurls/, async (msg) => {
    const chatId = msg.chat.id;
    await user.updateOne({
        userId: chatId
    }, {
        $unset: {
            urls: 1
        }
    }, ((err, data) => {
        if (err) {
            console.log(err);
        } else {
            bot.sendMessage(chatId, "Urls deleted successfully");
        }
    }))
})

bot.onText(/\/urls/, async (msg) => {

    const chatId = msg.chat.id;
    let text = "";
    let userdetail = await user.findOne({
        userId: chatId
    });
    console.log(userdetail);
    console.log(userdetail.urls);
    if (userdetail.urls.length == 0) {
        await bot.sendMessage(chatId, "No urls added yet.Add them by sending /add <url>.");
    } else {

        for (let i = 0; i < userdetail.urls.length; i++) {

            text = `${text}${i + 1}. ${userdetail.urls[i]}\n`;
        }
        await bot.sendMessage(chatId, text);
    }

});


bot.onText(/\/track/, async (msg) => {
    let currentPrice = [];
    const chatId = msg.chat.id;
    let userdetail = await user.findOne({
        userId: chatId
    });
    console.log(userdetail);

    if (userdetail.urls.length == 0) {
        bot.sendMessage(chatId, "No urls added yet.Add them by sending /add <url>.")
    } else {
        bot.sendMessage(chatId, "Tracking started");


        for (let i = 0; i < userdetail.urls.length; i++) {

            let data = await getData(userdetail.urls[i]);
            currentPrice.push(data.price);
            console.log(currentPrice);
        }



        let autocheck = setInterval(async () => {

            let userdetail = await user.findOne({
                userId: chatId
            });

            if (userdetail.urls.length > 0) {

                for (let i = 0; i < userdetail.urls.length; i++) {

                    let data = await getData(userdetail.urls[i]);
                    if (data.price >= currentPrice[i]) {
                        console.log(`latest Price ${data.price}`);
                        console.log(`current Price ${currentPrice[i]}`);
                        continue;
                    } else {
                        bot.sendMessage(chatId, `<i>Product:</i> ${data.name}\n<i>Current price:</i> ${data.price}\n<i>Last checked Price:</i> <b>${currentPrice[i]}</b>\n <i>Url:</i> ${userdetail.urls[i]}`, {
                            parse_mode: "HTML"
                        });
                        await user.updateOne({
                            userId: chatId
                        }, {
                            $pull: {
                                urls: userdetail.urls[i]
                            }
                        });
                        currentPrice.splice(i, 1);
                        console.log(currentPrice);
                    }
                }
            } else {
                clearInterval(autocheck);
            }


        }, 60000);
    }
})


bot.onText(/\/notify/, async (msg, match) => {

    const chatId = msg.chat.id;

    let userdetail = await user.findOne({
        userId: chatId
    });
    console.log(userdetail);

    if (userdetail.urls.length == 0) {
        bot.sendMessage(chatId, "No urls added yet.Add them by sending /add <url>.")
    } else {
        bot.sendMessage(chatId, "Checking stock");


        let autocheck = setInterval(async () => {

            let userdetail = await user.findOne({
                userId: chatId
            });

            if (userdetail.urls.length > 0) {

                for (let i = 0; i < userdetail.urls.length; i++) {

                    let data = await getData(userdetail.urls[i]);
                    if (data.stock == "Currently unavailable.") {
                        console.log(data.stock);
                        continue;
                    } else {
                        bot.sendMessage(chatId, `<i>Stock status:</i> <b>${data.stock}</b> \n<i>Product:</i> ${data.name} \n<i>Price:</i> ${data.price} \n<i>Url:</i> ${userdetail.urls[i]}`, {
                            parse_mode: "HTML"
                        });
                        await user.updateOne({
                            userId: chatId
                        }, {
                            $pull: {
                                urls: userdetail.urls[i]
                            }
                        });
                        console.log(data.stock);
                    }
                }
            } else {
                clearInterval(autocheck);
            }


        }, 60000);
    }
})