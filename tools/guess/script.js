


$(document).ready(function () {

    makeGuess()

    $("#higher").click(function () {
        $("#rangeFrom").val($("#guess").html())
        makeGuess()
    })
    $("#lower").click(function () {
        $("#rangeTo").val($("#guess").html())
        makeGuess()
    })
    $("#reset").click(function () {
        $("#rangeFrom").val("1")
        $("#rangeTo").val("100")
        makeGuess()
    })

    $('#rangeFrom').on('input', function () {
        makeGuess()
    });

    $('#rangeTo').on('input', function () {
        makeGuess()
    });
});


function makeGuess() {
    var fromVal = parseInt($("#rangeFrom").val())
    var toVal = parseInt($("#rangeTo").val())
    var mid = parseInt((fromVal + toVal) / 2)
    $("#guess").html(mid)
}